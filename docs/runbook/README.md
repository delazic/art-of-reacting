# Deployment runbooks

Step-by-step, copy-pasteable AWS deployment procedures.

**Status:** Empty — populated in **Phase 4** (initial AWS deployment).

## Planned contents

- `aws-baseline.md` — one-time setup: IAM instance profile, ECR repo, EC2 key pair (region: `eu-west-1`)
- `deploy-api.md` — build API image, push to ECR, EC2 launch + user-data + Elastic IP
- `deploy-frontend.md` — build static bundle, S3 upload, CloudFront distribution with two behaviors
- `redeploy-api.md` — day-2 procedure for pushing a new API image and restarting the container
- `redeploy-frontend.md` — day-2 procedure for `aws s3 sync` + CloudFront invalidation

## Conventions

- Every command in this folder is copy-pasteable as-is (PowerShell and Bash where they diverge)
- Every command that mutates AWS state names the resource being created/changed on the line above it
- Region is always `eu-west-1` — do not omit `--region` on `aws` CLI commands
