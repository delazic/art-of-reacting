# Runbook: AWS baseline (one-time)

One-time account setup that later runbooks depend on: ECR repository, a pull-only IAM role for the EC2 instance, an SSH key pair, and a security group.

Region is **`eu-west-1`** throughout. Every `aws` command below passes `--region` explicitly — do not rely on a configured default.

**Shell:** all commands in this file run in **PowerShell on the Windows laptop**.

Commands that **create or modify AWS resources** are marked `# MUTATES:` on the line above.

## Prerequisites

- AWS CLI v2 installed and authenticated with an identity that can create ECR/IAM/EC2 resources
- An SSH client (`ssh` ships with Windows 10 as an optional feature)

## Variables

Set these once per shell. Everything below refers to them.

```powershell
$Region  = "eu-west-1"
$Repo    = "artofreacting-api"
$RoleNm  = "artofreacting-ec2-role"
$ProfNm  = "artofreacting-ec2-profile"
$KeyNm   = "artofreacting-key"
$SgNm    = "artofreacting-api-sg"
```

## Step 1 — Confirm who and where you are

Read-only. Establishes the account ID that later ARNs need, and proves your credentials work before anything is created.

```powershell
aws sts get-caller-identity --output table
$AccountId = aws sts get-caller-identity --query Account --output text
$AccountId
```

Expected: your account ID, and an ARN you recognise. If this fails, stop and fix credentials — nothing later can work.

## Step 2 — Create the ECR repository

ECR is the source of truth for the API image. Tag immutability is on so a given tag can never silently point at different bytes; scan-on-push gives free basic CVE reporting.

```powershell
# MUTATES: creates ECR repository artofreacting-api
aws ecr create-repository `
  --repository-name $Repo `
  --image-tag-mutability IMMUTABLE `
  --image-scanning-configuration scanOnPush=true `
  --region $Region
```

Record the `repositoryUri` from the output — it is the registry path used for every tag and push:

```powershell
$RepoUri = aws ecr describe-repositories --repository-names $Repo --region $Region --query "repositories[0].repositoryUri" --output text
$RepoUri     # e.g. 123456789012.dkr.ecr.eu-west-1.amazonaws.com/artofreacting-api
```

Optional hygiene — expire untagged layers so failed pushes don't accumulate:

```powershell
@'
{"rules":[{"rulePriority":1,"description":"Expire untagged images after 7 days","selection":{"tagStatus":"untagged","countType":"sinceImagePushed","countUnit":"days","countNumber":7},"action":{"type":"expire"}}]}
'@ | Out-File -Encoding ascii ecr-lifecycle.json

# MUTATES: sets a lifecycle policy on the ECR repository
aws ecr put-lifecycle-policy --repository-name $Repo --lifecycle-policy-text file://ecr-lifecycle.json --region $Region
```

## Step 3 — Create the pull-only instance role

The instance needs to `docker pull` its own image unattended, with no static credentials. It gets **exactly that and nothing more** — no push, no other repositories.

Two policy documents. The trust policy says "EC2 may assume this role":

```powershell
@'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Principal": { "Service": "ec2.amazonaws.com" }, "Action": "sts:AssumeRole" }
  ]
}
'@ | Out-File -Encoding ascii ec2-trust-policy.json
```

The permission policy grants pull actions on **this repository only**. Note the split: `ecr:GetAuthorizationToken` does not support resource-level permissions and must be `"*"` — that is an ECR API constraint, not sloppiness. It only mints a token; what the token can *do* is decided by the statements below it.

```powershell
@"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AuthTokenCannotBeScopedToARepository",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "PullThisRepositoryOnly",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchCheckLayerAvailability"
      ],
      "Resource": "arn:aws:ecr:${Region}:${AccountId}:repository/${Repo}"
    }
  ]
}
"@ | Out-File -Encoding ascii ecr-pull-policy.json
```

Create the role, attach the policy inline, and wrap it in an instance profile (EC2 attaches profiles, not roles):

```powershell
# MUTATES: creates IAM role artofreacting-ec2-role
aws iam create-role --role-name $RoleNm --assume-role-policy-document file://ec2-trust-policy.json

# MUTATES: attaches the inline pull-only policy to that role
aws iam put-role-policy --role-name $RoleNm --policy-name "ecr-pull-artofreacting-api" --policy-document file://ecr-pull-policy.json

# MUTATES: creates instance profile artofreacting-ec2-profile
aws iam create-instance-profile --instance-profile-name $ProfNm

# MUTATES: puts the role inside the instance profile
aws iam add-role-to-instance-profile --instance-profile-name $ProfNm --role-name $RoleNm
```

> **Why no push permissions here.** The instance is also the v1 build host, so it *does* push — but with a 12-hour ECR token you mint from your own identity, not from its role. See [architecture.md § Image build host](../architecture.md#image-build-host-ec2-not-the-laptop-v1). Keeping push off the instance means a compromise of the box cannot overwrite the image it runs.

IAM is eventually consistent — the profile may take a few seconds to become usable by `run-instances`.

## Step 4 — Create the SSH key pair

The private key is generated once and never leaves your laptop. `*.pem` is already in `.gitignore`.

```powershell
# MUTATES: creates EC2 key pair artofreacting-key
aws ec2 create-key-pair --key-name $KeyNm --region $Region --query KeyMaterial --output text |
  Out-File -Encoding ascii "$KeyNm.pem"

# Windows equivalent of chmod 600 — OpenSSH refuses keys that are too permissive
icacls "$KeyNm.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

Keep `artofreacting-key.pem` somewhere you will not lose it; there is no way to re-download it.

## Step 5 — Create the security group

Start with SSH from your own address only. Port 80 is opened later, deliberately in two narrow steps: temporarily to your IP for verification ([deploy-api.md](./deploy-api.md)), then permanently to CloudFront's prefix list ([deploy-frontend.md](./deploy-frontend.md)). At no point is port 80 open to the world.

```powershell
$VpcId = aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --region $Region
$MyIp  = (Invoke-RestMethod https://checkip.amazonaws.com).Trim()
"VPC: $VpcId   your IP: $MyIp"

# MUTATES: creates security group artofreacting-api-sg
$SgId = aws ec2 create-security-group `
  --group-name $SgNm `
  --description "art-of-reacting API host: SSH from operator, :80 from CloudFront" `
  --vpc-id $VpcId --region $Region --query GroupId --output text
$SgId

# MUTATES: allows SSH from your current address only
aws ec2 authorize-security-group-ingress --group-id $SgId --protocol tcp --port 22 --cidr "$MyIp/32" --region $Region
```

If your ISP changes your address later, re-run the last command with the new `$MyIp` and revoke the stale rule.

## Step 6 — Verify the baseline

All read-only. Everything here should already exist before you move on.

```powershell
aws ecr describe-repositories --repository-names $Repo --region $Region --query "repositories[0].{uri:repositoryUri,mutability:imageTagMutability}"
aws iam get-instance-profile --instance-profile-name $ProfNm --query "InstanceProfile.Roles[0].RoleName"
aws iam get-role-policy --role-name $RoleNm --policy-name "ecr-pull-artofreacting-api" --query "PolicyDocument.Statement[].Sid"
aws ec2 describe-key-pairs --key-names $KeyNm --region $Region --query "KeyPairs[0].KeyName"
aws ec2 describe-security-groups --group-ids $SgId --region $Region --query "SecurityGroups[0].IpPermissions"
Test-Path "$KeyNm.pem"
```

Carry `$AccountId`, `$RepoUri`, `$SgId`, and `$VpcId` forward — [deploy-api.md](./deploy-api.md) needs all four.

## Teardown

Only when you are finished with the whole demo. Order matters: detach before delete.

```powershell
# MUTATES: deletes everything created above
aws iam remove-role-from-instance-profile --instance-profile-name $ProfNm --role-name $RoleNm
aws iam delete-instance-profile --instance-profile-name $ProfNm
aws iam delete-role-policy --role-name $RoleNm --policy-name "ecr-pull-artofreacting-api"
aws iam delete-role --role-name $RoleNm
aws ecr delete-repository --repository-name $Repo --force --region $Region
aws ec2 delete-key-pair --key-name $KeyNm --region $Region
aws ec2 delete-security-group --group-id $SgId --region $Region
```

The security group cannot be deleted while the instance still references it — terminate the instance first ([deploy-api.md § Teardown](./deploy-api.md#teardown)).
