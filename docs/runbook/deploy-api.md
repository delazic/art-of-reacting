# Runbook: deploy the API (EC2 + ECR)

Launches the EC2 instance, builds the API image **on it**, pushes that image to ECR, then pulls it back through the instance profile and runs it.

Region is **`eu-west-1`**. Prerequisite: [aws-baseline.md](./aws-baseline.md) completed, with `$AccountId`, `$RepoUri`, and `$SgId` still in your shell.

Each step says which shell it runs in:

- **[laptop]** — PowerShell on Windows
- **[ec2]** — bash, over SSH on the instance

Commands that create or modify state are marked `# MUTATES:`.

## Why EC2 builds the image

The laptop cannot. Building requires `mvn package` inside a Java 21 container, and the local Docker engine (19.03.12 / Boot2Docker, kernel 4.19.130) fails all Java 21 containers with `pthread_create failed (EPERM)`. The instance runs a current engine, so it builds the **unmodified** committed Dockerfile. Full reasoning: [architecture.md § Image build host](../architecture.md#image-build-host-ec2-not-the-laptop-v1).

This makes the instance a build host *and* a runtime host in v1. Phase 5 moves the build to CI and returns the instance to runtime-only.

## Step 1 — Pick the AMI

**[laptop]** Read-only. AWS publishes the current Amazon Linux 2023 AMI ID as an SSM public parameter, so you never hard-code a stale one.

```powershell
$Region = "eu-west-1"
$AmiId = aws ssm get-parameters `
  --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64 `
  --region $Region --query "Parameters[0].Value" --output text
$AmiId
```

AL2023 ships a current kernel and a current Docker package — which is precisely what the local environment lacks.

## Step 2 — Write the user-data script

**[laptop]** User-data runs once, as root, on first boot. It installs Docker and git and nothing else: the container is started later by hand, because at first boot the image does not exist in ECR yet.

```powershell
@'
#!/bin/bash
set -euxo pipefail
dnf update -y
dnf install -y docker git
systemctl enable --now docker
usermod -aG docker ec2-user
'@ -replace "`r`n", "`n" | Out-File -Encoding ascii user-data.sh
```

The `-replace` matters: a `\r\n` in a shell script reaches bash as a literal carriage return and breaks the shebang.

## Step 3 — Launch the instance

**[laptop]** `t3.small` (2 GB RAM), not `t3.micro`: the Maven build runs *on this box*, and 1 GB is not reliably enough for `mvn package` plus a container pull. Step 12 downsizes it once the image is in ECR. 16 GB of gp3 leaves room for the builder image, the Maven cache, and the final image.

The block device mapping goes in a file rather than inline. **PowerShell has no backslash escaping**, so an inline `"[{\"DeviceName\":…}]"` reaches the CLI with literal backslashes and fails with `Invalid JSON`. A `file://` reference sidesteps shell quoting entirely, the same way the IAM policies do.

```powershell
@'
[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":16,"VolumeType":"gp3","DeleteOnTermination":true}}]
'@ | Out-File -Encoding ascii block-device-mappings.json

# Confirm the prerequisites are actually populated before launching
"AMI:     $AmiId"
"SG:      $SgId"
"Region:  $Region"
Test-Path user-data.sh, block-device-mappings.json
```

```powershell
# MUTATES: launches one EC2 instance
$InstanceId = aws ec2 run-instances `
  --image-id $AmiId `
  --instance-type t3.small `
  --key-name artofreacting-key `
  --security-group-ids $SgId `
  --iam-instance-profile Name=artofreacting-ec2-profile `
  --block-device-mappings file://block-device-mappings.json `
  --user-data file://user-data.sh `
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=artofreacting-api}]" `
  --region $Region --query "Instances[0].InstanceId" --output text
$InstanceId

aws ec2 wait instance-running --instance-ids $InstanceId --region $Region
```

`--tag-specifications` needs no file: it uses the CLI's shorthand syntax, which contains no quotes for PowerShell to mangle.

Two failures worth recognising:

- **`ParamValidation` / `Invalid JSON`** — a client-side rejection. Nothing was launched, nothing is billing; fix the argument and re-run.
- **Invalid instance-profile** — IAM has not finished propagating. Wait a few seconds and retry the identical command.

## Step 4 — Allocate and associate the Elastic IP

**[laptop]** A stable address that survives stop/start, so the CloudFront origin never has to be edited.

```powershell
# MUTATES: allocates a new Elastic IP
$AllocId = aws ec2 allocate-address --domain vpc --region $Region --query AllocationId --output text

# MUTATES: associates that Elastic IP with the instance
aws ec2 associate-address --instance-id $InstanceId --allocation-id $AllocId --region $Region

$Eip = aws ec2 describe-addresses --allocation-ids $AllocId --region $Region --query "Addresses[0].PublicIp" --output text
$PublicDns = aws ec2 describe-instances --instance-ids $InstanceId --region $Region --query "Reservations[0].Instances[0].PublicDnsName" --output text
"EIP: $Eip"
"DNS: $PublicDns"
```

Keep **both**. `$Eip` is for your own verification; `$PublicDns` is what CloudFront will use as its origin, because **CloudFront rejects a bare IP address as an origin domain name**. The DNS name is derived from the EIP, so it is equally stable.

A public IPv4 address is billed hourly whether or not it is attached — release it at teardown.

## Step 5 — Connect and confirm the bootstrap

**[laptop]** First boot plus `dnf update` takes a couple of minutes. Then:

```powershell
ssh -i artofreacting-key.pem ec2-user@$Eip
```

**[ec2]** Confirm user-data actually finished — do not assume it did:

```bash
sudo tail -n 20 /var/log/cloud-init-output.log
docker --version
docker info --format '{{.ServerVersion}} / kernel {{.KernelVersion}}'
git --version
```

Expected: a current Docker (27.x or newer) and kernel 6.1. If `docker` says "permission denied", the `docker` group was added after your session opened — `exit` and SSH back in.

## Step 6 — Get the source onto the instance

The repository is at `github.com/delazic/art-of-reacting`. Pick whichever matches its visibility.

**If the repo is public — [ec2]:**

```bash
git clone https://github.com/delazic/art-of-reacting.git
cd art-of-reacting/artofreacting-api
```

**If the repo is private — [laptop]**, ship a snapshot of the committed tree over the existing key. No deploy key, no credentials on the instance:

```powershell
git archive --format=tar HEAD | gzip > aor-src.tgz
scp -i artofreacting-key.pem aor-src.tgz ec2-user@${Eip}:~/
```

**[ec2]:**

```bash
mkdir -p art-of-reacting && tar xzf aor-src.tgz -C art-of-reacting
cd art-of-reacting/artofreacting-api
ls Dockerfile pom.xml src
```

`git archive HEAD` exports committed content only — no `target/`, no local cruft, matching what `.dockerignore` would have excluded anyway.

## Step 7 — Build the image

**[ec2]** Tag with the commit you built from, so the image in ECR is traceable to source. Immutable tags in ECR make that guarantee stick.

```bash
export REGION=eu-west-1
export ACCOUNT_ID=<your-account-id>
export REPO_URI=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/artofreacting-api
export TAG=$(git rev-parse --short HEAD 2>/dev/null || echo 0.1.0)
echo "building $REPO_URI:$TAG"

docker build -t $REPO_URI:$TAG .
```

This is the first genuine execution of the Phase 3 Dockerfile. Expect it to take several minutes — it pulls the Maven image and populates the dependency layer.

Watch for two things:

- **The `dependency:go-offline` layer.** If it fails resolving a plugin artifact, that is a known rough edge of the goal; the fallback is to delete that one `RUN` line so `mvn package` fetches everything in a single layer. Report the output before changing anything.
- **`useradd` / `apt-get` in the runtime stage.** These assume the Debian-based `eclipse-temurin:21-jre`. If they fail, report the error.

Then confirm the image and its declared healthcheck:

```bash
docker images $REPO_URI
docker inspect --format '{{json .Config.Healthcheck}}' $REPO_URI:$TAG
```

## Step 8 — Verify the image runs, before pushing it

**[ec2]** No point pushing an image that cannot start. This is the runtime verification the local engine could not provide.

```bash
docker run -d --name aor-smoke -p 8080:8080 $REPO_URI:$TAG
sleep 20
docker ps --filter name=aor-smoke --format '{{.Status}}'
curl -fsS http://localhost:8080/actuator/health
curl -fsS http://localhost:8080/api/users
```

Expected: status shows `(healthy)` once the healthcheck passes, `{"status":"UP"}`, and `[]` from an empty repository. A quick round-trip:

```bash
curl -fsS -X POST http://localhost:8080/api/users -H 'Content-Type: application/json' -d '{"username":"alice"}'
curl -fsS http://localhost:8080/api/users
```

Then clear it away — the real container is started from the ECR image in step 11:

```bash
docker rm -f aor-smoke
```

## Step 9 — Push to ECR with an operator-minted token

The instance has **no push permission**. You mint a 12-hour ECR token from your own identity instead, so push privilege never lives on the box.

**[laptop]** Print the token:

```powershell
aws ecr get-login-password --region $Region
```

**[ec2]** Log in with it, paste-as-password style, then push:

```bash
docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
# paste the token, press Enter, then Ctrl-D

# MUTATES: writes an image into the ECR repository
docker push $REPO_URI:$TAG
```

An ECR token carries the permissions of whoever requested it — which is why this works from a role that cannot push on its own.

**[laptop]** Confirm ECR has it:

```powershell
aws ecr describe-images --repository-name artofreacting-api --region $Region --query "imageDetails[].{tags:imageTags,pushedAt:imagePushedAt,mb:imageSizeInBytes}"
```

## Step 10 — Prove the unattended pull path works

**[ec2]** The image is still in the local cache from the build, which would mask a broken pull. Discard the local copy and the operator login, then pull as the *instance* — exercising exactly what an unattended restart depends on.

```bash
docker logout $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
docker rmi $REPO_URI:$TAG

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
docker pull $REPO_URI:$TAG
```

That `aws ecr get-login-password` used the instance profile via IMDS, with no credentials on disk. If it fails, the role's pull policy is wrong — fix it before continuing, because the runtime depends on it.

## Step 11 — Run the API container

**[ec2]** Host port 80 maps to the container's 8080, which is what `:80 → API :8080` means in the architecture diagram. `--restart=unless-stopped` brings it back after a reboot.

```bash
# MUTATES: starts the long-lived API container
docker run -d --name artofreacting-api \
  -p 80:8080 \
  --restart=unless-stopped \
  $REPO_URI:$TAG

sleep 20
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
curl -fsS http://localhost/actuator/health
curl -fsS http://localhost/api/users
```

The app still runs as non-root uid 10001 *inside* the container; only Docker's host-side binding of port 80 is privileged.

## Step 12 — Verify from outside, then close the door

Port 80 is not yet reachable from anywhere. Open it to your address only, check, and revoke — CloudFront gets its own rule in [deploy-frontend.md](./deploy-frontend.md).

**[laptop]:**

```powershell
$MyIp = (Invoke-RestMethod https://checkip.amazonaws.com).Trim()

# MUTATES: temporarily allows :80 from your address
aws ec2 authorize-security-group-ingress --group-id $SgId --protocol tcp --port 80 --cidr "$MyIp/32" --region $Region

Invoke-RestMethod "http://$Eip/api/users"
Invoke-RestMethod "http://$Eip/api/users" -Method Post -ContentType 'application/json' -Body '{"username":"bob"}'
Invoke-RestMethod "http://$Eip/api/users"

# MUTATES: revokes that temporary rule
aws ec2 revoke-security-group-ingress --group-id $SgId --protocol tcp --port 80 --cidr "$MyIp/32" --region $Region
```

This is the architecture's `verify http://<eip>/api/users` step. Users registered here are in memory and vanish on the next container restart — that is the documented design, not a bug.

## Step 13 — Optional: downsize to t3.micro

The larger instance was for the build. Steady-state serving fits `t3.micro`, which is free-tier eligible. The EIP and the EBS volume survive; the container restarts on boot via `--restart=unless-stopped`.

**[laptop]:**

```powershell
# MUTATES: stops the instance, changes its type, starts it again
aws ec2 stop-instances --instance-ids $InstanceId --region $Region
aws ec2 wait instance-stopped --instance-ids $InstanceId --region $Region
aws ec2 modify-instance-attribute --instance-id $InstanceId --instance-type t3.micro --region $Region
aws ec2 start-instances --instance-ids $InstanceId --region $Region
aws ec2 wait instance-running --instance-ids $InstanceId --region $Region
```

Leave it at `t3.small` if you intend to rebuild on it soon; every rebuild wants the extra memory. In-memory users are lost across the stop.

## Record these

[deploy-frontend.md](./deploy-frontend.md) needs `$PublicDns` and `$SgId`; [redeploy-api.md](./redeploy-api.md) needs `$InstanceId`, `$Eip`, and `$RepoUri`.

## Teardown

```powershell
# MUTATES: terminates the instance and releases the address
aws ec2 terminate-instances --instance-ids $InstanceId --region $Region
aws ec2 wait instance-terminated --instance-ids $InstanceId --region $Region
aws ec2 release-address --allocation-id $AllocId --region $Region
```

Release the EIP even though the instance is gone — an unattached public IPv4 address keeps billing.
