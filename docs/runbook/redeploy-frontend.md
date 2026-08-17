# Runbook: redeploy the frontend (day 2)

Ships a new SPA build to S3 and invalidates the one file that needs it. No EC2 or ECR involvement — the frontend never travels as a container image on AWS.

Region **`eu-west-1`**. Prerequisites: [deploy-frontend.md](./deploy-frontend.md) completed once, with `$Bucket`, `$DistId`, and `$DistDomain` to hand.

All commands are **[laptop]** PowerShell. `# MUTATES:` marks state changes.

## Step 1 — Build

```powershell
cd artofreacting
npm ci                  # only when package-lock.json changed
npm run build
```

`npm run build` typechecks before bundling, so a type error stops the deploy here rather than in production.

## Step 2 — Upload

Same two passes as the first deploy, for the same reason: hashed assets are immutable, `index.html` is not.

```powershell
$Region = "eu-west-1"

# MUTATES: uploads hashed assets and deletes ones no longer in dist/
aws s3 sync dist/ "s3://$Bucket/" --delete --exclude index.html `
  --cache-control "public,max-age=31536000,immutable" --region $Region

# MUTATES: overwrites index.html
aws s3 cp dist/index.html "s3://$Bucket/index.html" `
  --cache-control "no-store" --content-type "text/html" --region $Region
```

Order matters: assets first, then `index.html`. Reverse it and a browser can briefly fetch a fresh `index.html` referencing assets that are not uploaded yet.

`--delete` removes previous builds' hashed files. Anyone mid-session on the old bundle may 404 on a lazily-fetched chunk — irrelevant here, since the app is one eagerly-loaded bundle.

## Step 3 — Invalidate `index.html`

Only `index.html` needs it. Hashed assets have new filenames, so nothing stale can be requested; invalidating `/*` would just cost more and evict a warm cache for no reason.

```powershell
# MUTATES: creates a CloudFront invalidation
$InvId = aws cloudfront create-invalidation --distribution-id $DistId --paths "/" "/index.html" `
  --query "Invalidation.Id" --output text
$InvId

aws cloudfront wait invalidation-completed --distribution-id $DistId --id $InvId
```

Both `/` and `/index.html` are listed because `DefaultRootObject` means the two are cached separately.

The first 1,000 invalidation paths per month are free, which is ample at two per deploy.

## Step 4 — Verify

```powershell
Invoke-WebRequest "https://$DistDomain/" -UseBasicParsing | Select-Object StatusCode, @{n='cache';e={$_.Headers.'Cache-Control'}}
Invoke-RestMethod "https://$DistDomain/api/users"
```

Then hard-reload the browser at `https://<distribution-domain>` and confirm the change is visible and registering a user still works. If you see the old bundle, check that the invalidation completed and that `index.html` really carries `no-store`:

```powershell
aws s3api head-object --bucket $Bucket --key index.html --region $Region --query "{cc:CacheControl,ct:ContentType,modified:LastModified}"
```

## If the API is unreachable after a frontend deploy

The frontend cannot break the API — but it is the first place a broken API becomes visible, as "Could not reach the API." with a **Try again** button. Check the API path directly before suspecting this deploy:

```powershell
Invoke-RestMethod "https://$DistDomain/api/users"
```

A 502 or 504 there points at EC2, not S3 — see [redeploy-api.md](./redeploy-api.md) and confirm the container is running and healthy.
