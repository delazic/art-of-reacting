# Runbook: redeploy the API (day 2)

Ships a new API image after a code change. Same shape as the first deploy, minus the one-time resource creation.

Region **`eu-west-1`**. Prerequisites: [deploy-api.md](./deploy-api.md) completed once, and `$InstanceId`, `$Eip`, `$AccountId` to hand.

**[laptop]** = PowerShell on Windows, **[ec2]** = bash over SSH. `# MUTATES:` marks state changes.

> **Registered users are lost.** The store is a `ConcurrentHashMap`; replacing the container empties it. That is the documented v1 design — see [architecture.md § Storage](../architecture.md#storage). Do not treat it as a redeploy defect.

## Step 0 — Consider the instance size

The build runs on the instance. If you downsized to `t3.micro` in [deploy-api.md § Step 13](./deploy-api.md#step-13--optional-downsize-to-t3micro), `mvn package` may struggle in 1 GB. Either size up for the build and back down after, or add swap once:

**[ec2]** one-time swap file, a cheaper alternative to resizing:

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

## Step 1 — Get the new source onto the instance

**[ec2]** if the repo is public:

```bash
cd ~/art-of-reacting && git pull
```

**[laptop]** if it is private:

```powershell
git archive --format=tar HEAD | gzip > aor-src.tgz
scp -i artofreacting-key.pem aor-src.tgz ec2-user@${Eip}:~/
```

**[ec2]:**

```bash
rm -rf ~/art-of-reacting && mkdir -p ~/art-of-reacting
tar xzf ~/aor-src.tgz -C ~/art-of-reacting
```

## Step 2 — Build with a new tag

**[ec2]** Never reuse a tag: the ECR repository is `IMMUTABLE`, so a repeat tag is rejected outright rather than silently replacing the image. Tagging by commit keeps ECR traceable to source.

```bash
cd ~/art-of-reacting/artofreacting-api
export REGION=eu-west-1
export ACCOUNT_ID=<your-account-id>
export REPO_URI=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/artofreacting-api
export TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)
echo "building $REPO_URI:$TAG"

docker build -t $REPO_URI:$TAG .
```

Layer caching means only the stages after your change rebuild — edit `src/` and the Maven dependency layer is reused; edit `pom.xml` and it is not.

## Step 3 — Push it

**[laptop]** mint a fresh token (they expire after 12 hours):

```powershell
aws ecr get-login-password --region eu-west-1
```

**[ec2]:**

```bash
docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
# paste the token, Enter, Ctrl-D

# MUTATES: writes a new image into ECR
docker push $REPO_URI:$TAG
docker logout $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
```

Push privilege stays off the instance profile by design — see [architecture.md § Image build host](../architecture.md#image-build-host-ec2-not-the-laptop-v1).

## Step 4 — Swap the running container

**[ec2]** Pull through the instance profile, so the deploy exercises the same path an unattended restart uses.

```bash
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
docker pull $REPO_URI:$TAG

# MUTATES: replaces the running API container
docker stop artofreacting-api && docker rm artofreacting-api
docker run -d --name artofreacting-api -p 80:8080 --restart=unless-stopped $REPO_URI:$TAG

sleep 20
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Image}}'
curl -fsS http://localhost/actuator/health
```

Expect `(healthy)` in the status and the new tag in the image column. There is a few seconds of downtime while the container restarts — acceptable for v1, with no ALB and no second instance by design.

## Step 5 — Verify through CloudFront

**[laptop]** The API behavior uses `CachingDisabled`, so no invalidation is needed — the change is live as soon as the container is.

```powershell
Invoke-RestMethod "https://$DistDomain/api/users"
Invoke-RestMethod "https://$DistDomain/api/users" -Method Post -ContentType 'application/json' -Body '{"username":"dave"}'
```

## Step 6 — Tidy old images

**[ec2]** Build layers accumulate on a 16 GB volume.

```bash
docker images $REPO_URI
docker image prune -f              # dangling layers only
docker rmi $REPO_URI:<old-tag>     # a specific superseded image
df -h /
```

Untagged images in ECR expire after 7 days via the lifecycle policy from [aws-baseline.md](./aws-baseline.md#step-2--create-the-ecr-repository); tagged ones stay until you remove them.

## Rollback

Every previous tag is still in ECR, so rolling back is a pull and a restart — no rebuild.

```powershell
aws ecr describe-images --repository-name artofreacting-api --region eu-west-1 `
  --query "reverse(sort_by(imageDetails,&imagePushedAt))[].{tags:imageTags,pushedAt:imagePushedAt}" --output table
```

**[ec2]:**

```bash
export TAG=<previous-tag>
docker pull $REPO_URI:$TAG
docker stop artofreacting-api && docker rm artofreacting-api
docker run -d --name artofreacting-api -p 80:8080 --restart=unless-stopped $REPO_URI:$TAG
```
