# syntax=docker/dockerfile:1

# ---------- Stage 1: build the jar ----------
# The Maven image rather than eclipse-temurin:21-jdk + ./mvnw: the wrapper is
# committed as git mode 100644 (not executable), so ./mvnw fails in a Linux
# container, and its distributionType=script downloads the Maven distribution at
# build time, which would need wget and unzip in the builder. This image already
# carries Maven on the same 3.9 line the wrapper pins, and ./mvnw stays
# authoritative for local builds on Windows.
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /build

# Resolve dependencies against the POM alone, in a layer of its own, so editing
# a source file does not re-download half of Maven Central on the next build.
COPY pom.xml ./
RUN mvn -B dependency:go-offline

COPY src/ src/

# Tests are skipped here on purpose: `./mvnw test` covers them locally and
# Phase 5 will run them in CI. Running them again during the image build would
# roughly double it for no additional signal.
RUN mvn -B package -DskipTests

# ---------- Stage 2: run it ----------
FROM eclipse-temurin:21-jre AS runtime

# curl exists solely for the HEALTHCHECK below, and is the only package added to
# either runtime image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Non-root. The app writes nothing to disk, so it needs no home directory.
RUN useradd --system --uid 10001 --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=build /build/target/artofreacting-api.jar app.jar

USER app

# Documentation only. This port is deliberately not published by
# docker-compose.yml: the API is reachable only from inside the compose network.
EXPOSE 8080

# Declared in the image rather than in docker-compose.yml so the identical check
# travels to ECR and EC2 in Phase 4. compose only gates the web container on it.
# start-period is generous because the reference environment runs this in a
# 1-CPU VirtualBox VM, where Spring Boot needs appreciably longer to boot.
HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=5 \
  CMD curl -fsS http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
