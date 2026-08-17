# Deployment runbooks

Step-by-step, copy-pasteable AWS deployment procedures.

**Status:** Written in **Phase 4**. Not yet executed against AWS.

## Contents

| Runbook | Purpose | When |
| ------- | ------- | ---- |
| [`aws-baseline.md`](./aws-baseline.md) | ECR repo, pull-only IAM role + instance profile, key pair, security group | Once |
| [`deploy-api.md`](./deploy-api.md) | Launch EC2 + Elastic IP, build the image **on the instance**, push to ECR, pull back and run | First API deploy |
| [`deploy-frontend.md`](./deploy-frontend.md) | Build the bundle, private S3 bucket, CloudFront + OAC with `/api/*` → EC2 | First frontend deploy |
| [`redeploy-api.md`](./redeploy-api.md) | New image, push, swap the container, roll back | Day 2 |
| [`redeploy-frontend.md`](./redeploy-frontend.md) | `aws s3 sync` + targeted CloudFront invalidation | Day 2 |

Run them in that order the first time. Region is **`eu-west-1`** everywhere.

## Conventions

- Every command is copy-pasteable as-is. Each step states its shell: **[laptop]** is PowerShell on Windows, **[ec2]** is bash over SSH.
- Every command that mutates AWS or instance state is marked `# MUTATES:` on the line above.
- Region is always passed explicitly — no `aws` command here relies on a configured default.
- Resource names are fixed: `artofreacting-api` (ECR), `artofreacting-ec2-role` / `artofreacting-ec2-profile` (IAM), `artofreacting-key` (key pair), `artofreacting-api-sg` (security group), `artofreacting-frontend-<account-id>` (bucket).
- Each runbook ends with teardown, so nothing bills indefinitely.

## Two things that differ from a textbook deployment

**The image is built on EC2, not on the laptop.** The local Docker engine cannot run Java 21 containers, so `docker build` fails there before a push is possible. The instance is therefore both build host and runtime host in v1 — a known compromise that Phase 5 removes by moving the build to CI. Reasoning: [architecture.md § Image build host](../architecture.md#image-build-host-ec2-not-the-laptop-v1).

**The instance never gets ECR push permissions.** Its profile is pull-only. Pushes use a 12-hour ECR token minted from the operator's own identity, so push privilege never lives on the box and there are no static access keys anywhere.

## Deferred, deliberately

Terraform, GitHub Actions, Route 53, and ACM are all Phase 5+. These runbooks are the executable specification that a Terraform module would later encode — writing them first means the topology is understood before it is automated.
