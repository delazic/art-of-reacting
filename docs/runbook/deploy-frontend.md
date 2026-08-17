# Runbook: deploy the frontend (S3 + CloudFront)

Builds the SPA on the laptop, uploads it to a **private** S3 bucket, and puts a CloudFront distribution in front with two behaviors: static files from S3, and `/api/*` to the EC2 origin. That second behavior is what keeps the frontend same-origin with no CORS and no `VITE_API_URL`.

Region is **`eu-west-1`**. Prerequisites: [aws-baseline.md](./aws-baseline.md) and [deploy-api.md](./deploy-api.md) complete, with `$AccountId`, `$SgId`, and `$PublicDns` in your shell.

All commands are **[laptop]** PowerShell unless marked otherwise. `# MUTATES:` marks state changes.

Note the frontend Docker image plays **no part here** — on AWS the SPA is static files in S3. That image exists for local compose parity and for the EC2 fallback in [architecture.md](../architecture.md#aws-architecture-initial).

## Variables

```powershell
$Region = "eu-west-1"
$Bucket = "artofreacting-frontend-$AccountId"   # bucket names are globally unique
$Bucket
```

## Step 1 — Build the bundle

The same `npm run build` used in Phase 2 — typecheck then Vite build. Nothing about this build is environment-specific, which is the entire point of the relative-`/api` rule.

```powershell
cd ..\..\artofreacting          # adjust to your shell's location
npm run build
Get-ChildItem dist -Recurse -File | Select-Object Name, Length
```

Expected: `index.html`, plus content-hashed files under `dist/assets/`.

## Step 2 — Create the private bucket

Outside `us-east-1`, S3 requires an explicit location constraint. The bucket is private and stays private — CloudFront reaches it with OAC, not via public access, and static website hosting is deliberately **not** enabled.

```powershell
# MUTATES: creates the S3 bucket
aws s3api create-bucket `
  --bucket $Bucket `
  --region $Region `
  --create-bucket-configuration LocationConstraint=$Region

# MUTATES: blocks all forms of public access
aws s3api put-public-access-block `
  --bucket $Bucket `
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" `
  --region $Region
```

## Step 3 — Upload with cache headers

Two passes, because the two kinds of file need opposite caching. This mirrors `artofreacting/nginx.conf` exactly — same policy, different enforcement point.

```powershell
# MUTATES: uploads hashed assets, cached hard
aws s3 sync dist/ "s3://$Bucket/" --delete --exclude index.html `
  --cache-control "public,max-age=31536000,immutable" --region $Region

# MUTATES: uploads index.html, never cached
aws s3 cp dist/index.html "s3://$Bucket/index.html" `
  --cache-control "no-store" --content-type "text/html" --region $Region
```

Hashed filenames change whenever content changes, so they can be cached forever. `index.html` is the one file whose name is stable and whose content moves — cache it and a redeploy would keep serving the previous bundle's asset URLs.

## Step 4 — Create the Origin Access Control

OAC lets CloudFront sign requests to a private bucket with SigV4. It replaces the older OAI.

```powershell
@'
{
  "Name": "artofreacting-s3-oac",
  "Description": "SigV4 access from CloudFront to the private frontend bucket",
  "SigningProtocol": "sigv4",
  "SigningBehavior": "always",
  "OriginAccessControlOriginType": "s3"
}
'@ | Out-File -Encoding ascii oac.json

# MUTATES: creates the Origin Access Control
$OacId = aws cloudfront create-origin-access-control --origin-access-control-config file://oac.json `
  --query "OriginAccessControl.Id" --output text
$OacId
```

## Step 5 — Look up the managed policy IDs

Read-only. Fetch them rather than trusting hard-coded UUIDs.

```powershell
$CachingOptimized = aws cloudfront list-cache-policies --type managed --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='Managed-CachingOptimized'].CachePolicy.Id | [0]" --output text
$CachingDisabled  = aws cloudfront list-cache-policies --type managed --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='Managed-CachingDisabled'].CachePolicy.Id | [0]" --output text
$AllViewerNoHost  = aws cloudfront list-origin-request-policies --type managed --query "OriginRequestPolicyList.Items[?OriginRequestPolicy.OriginRequestPolicyConfig.Name=='Managed-AllViewerExceptHostHeader'].OriginRequestPolicy.Id | [0]" --output text
"CachingOptimized       $CachingOptimized"
"CachingDisabled        $CachingDisabled"
"AllViewerExceptHost    $AllViewerNoHost"
```

Why these three:

- **CachingOptimized** on the default behavior — static hashed assets are ideal CDN cache fodder.
- **CachingDisabled** on `/api/*` — `POST /api/users` must never be cached, and a cached `GET /api/users` would show a stale list.
- **AllViewerExceptHostHeader** on `/api/*` — forwards the viewer's headers, query string, cookies, and **body** (POST needs it) while replacing `Host` with the origin's. Forwarding the CloudFront `Host` to an EC2 origin is the classic cause of confusing origin behavior.

## Step 6 — Create the distribution

Two origins, two behaviors. `/api/*` is an ordered behavior evaluated before the default.

```powershell
$CallerRef = "artofreacting-" + (Get-Date -Format "yyyyMMddHHmmss")

@"
{
  "CallerReference": "$CallerRef",
  "Comment": "art-of-reacting: SPA from S3, /api/* to EC2",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 2,
    "Items": [
      {
        "Id": "s3-frontend",
        "DomainName": "$Bucket.s3.$Region.amazonaws.com",
        "OriginPath": "",
        "CustomHeaders": { "Quantity": 0 },
        "S3OriginConfig": { "OriginAccessIdentity": "" },
        "OriginAccessControlId": "$OacId",
        "ConnectionAttempts": 3,
        "ConnectionTimeout": 10
      },
      {
        "Id": "ec2-api",
        "DomainName": "$PublicDns",
        "OriginPath": "",
        "CustomHeaders": { "Quantity": 0 },
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only",
          "OriginSslProtocols": { "Quantity": 1, "Items": ["TLSv1.2"] },
          "OriginReadTimeout": 30,
          "OriginKeepaliveTimeout": 5
        },
        "ConnectionAttempts": 3,
        "ConnectionTimeout": 10
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-frontend",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
    },
    "CachePolicyId": "$CachingOptimized",
    "Compress": true
  },
  "CacheBehaviors": {
    "Quantity": 1,
    "Items": [
      {
        "PathPattern": "/api/*",
        "TargetOriginId": "ec2-api",
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
          "Quantity": 7,
          "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
          "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
        },
        "CachePolicyId": "$CachingDisabled",
        "OriginRequestPolicyId": "$AllViewerNoHost",
        "Compress": true
      }
    ]
  },
  "PriceClass": "PriceClass_100"
}
"@ | Out-File -Encoding ascii cf-distribution.json

# MUTATES: creates the CloudFront distribution
$DistId = aws cloudfront create-distribution --distribution-config file://cf-distribution.json --query "Distribution.Id" --output text
$DistDomain = aws cloudfront get-distribution --id $DistId --query "Distribution.DomainName" --output text
"$DistId  ->  https://$DistDomain"
```

Two deliberate omissions:

- **No `CustomErrorResponses`.** The usual SPA trick maps 403/404 to `/index.html` with status 200 — but custom error responses apply to the **whole distribution**, so an API 404 would come back as HTML with a 200 and break `src/api.ts`'s error handling. There is no client-side router in v1, so the fallback buys nothing. Add it only alongside a router, and scope the consequences then.
- **No `Aliases` / custom certificate.** No domain is chosen yet; the `*.cloudfront.net` name carries a valid certificate on its own. Route 53 and ACM stay deferred.

`PriceClass_100` limits edge locations to North America and Europe — cheapest tier, appropriate for a demo.

## Step 7 — Let CloudFront read the bucket

The bucket policy trusts the CloudFront **service principal**, narrowed by `AWS:SourceArn` to this one distribution. Without that condition, any CloudFront distribution in any account could read the bucket.

```powershell
@"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowThisDistributionOnly",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$Bucket/*",
      "Condition": {
        "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::${AccountId}:distribution/$DistId" }
      }
    }
  ]
}
"@ | Out-File -Encoding ascii bucket-policy.json

# MUTATES: applies the bucket policy
aws s3api put-bucket-policy --bucket $Bucket --policy file://bucket-policy.json --region $Region
```

## Step 8 — Let CloudFront reach EC2 on port 80

AWS publishes a managed prefix list of CloudFront's origin-facing ranges, so the API host is reachable by the CDN and by nothing else. This is the permanent replacement for the temporary rule in [deploy-api.md § Step 12](./deploy-api.md#step-12--verify-from-outside-then-close-the-door).

```powershell
$CfPrefixList = aws ec2 describe-managed-prefix-lists `
  --filters "Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing" `
  --region $Region --query "PrefixLists[0].PrefixListId" --output text
$CfPrefixList

# MUTATES: allows :80 from CloudFront origin-facing ranges only
aws ec2 authorize-security-group-ingress `
  --group-id $SgId `
  --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,PrefixListIds=[{PrefixListId=$CfPrefixList,Description=CloudFront origin-facing}]" `
  --region $Region
```

Port 80 is now open to CloudFront and nobody else. Traffic on that hop is plain HTTP over the public internet — an accepted v1 tradeoff, revisited when a domain and ACM certificate arrive.

## Step 9 — Verify end to end

Deployment takes a few minutes to propagate.

```powershell
aws cloudfront wait distribution-deployed --id $DistId
"https://$DistDomain"
```

Then check each layer:

```powershell
# the SPA itself, from the S3 origin
Invoke-WebRequest "https://$DistDomain/" -UseBasicParsing | Select-Object StatusCode, @{n='ct';e={$_.Headers.'Content-Type'}}

# the API, through the /api/* behavior to EC2
Invoke-RestMethod "https://$DistDomain/api/users"

# a write, proving POST bodies survive the behavior
Invoke-RestMethod "https://$DistDomain/api/users" -Method Post -ContentType 'application/json' -Body '{"username":"carol"}'
Invoke-RestMethod "https://$DistDomain/api/users"
```

Finally open `https://<distribution-domain>` in a browser, register a username, and confirm it appears in the list. The browser only ever talks to the CloudFront domain — same-origin, exactly as in dev and in compose.

Worth confirming the caching split took effect:

```powershell
(Invoke-WebRequest "https://$DistDomain/" -UseBasicParsing).Headers.'Cache-Control'          # no-store
(Invoke-WebRequest "https://$DistDomain/api/users" -UseBasicParsing).Headers.'X-Cache'       # a miss every time
```

## Record these

`$Bucket`, `$DistId`, and `$DistDomain` are needed by [redeploy-frontend.md](./redeploy-frontend.md).

## Teardown

A distribution must be disabled and fully deployed before it can be deleted, which takes a while.

```powershell
# MUTATES: empties and deletes the bucket, disables and deletes the distribution
aws s3 rm "s3://$Bucket" --recursive --region $Region
aws s3api delete-bucket --bucket $Bucket --region $Region

# Disable via the console, or fetch the config, set Enabled=false, and put it back with its ETag:
$etag = aws cloudfront get-distribution-config --id $DistId --query ETag --output text
aws cloudfront get-distribution-config --id $DistId --query DistributionConfig > cf-disable.json
#   edit cf-disable.json: "Enabled": false
aws cloudfront update-distribution --id $DistId --distribution-config file://cf-disable.json --if-match $etag
aws cloudfront wait distribution-deployed --id $DistId
$etag2 = aws cloudfront get-distribution-config --id $DistId --query ETag --output text
aws cloudfront delete-distribution --id $DistId --if-match $etag2

aws cloudfront delete-origin-access-control --id $OacId --if-match (aws cloudfront get-origin-access-control --id $OacId --query ETag --output text)
```
