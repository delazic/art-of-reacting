# artofreacting-api

Java 21 + Spring Boot 3 REST API for art-of-reacting.

**Status:** Implemented in **Phase 1**.

## Stack

- Java 21
- Spring Boot 3.x
- Maven (via `./mvnw` wrapper)
- Starters: `spring-boot-starter-web`, `spring-boot-starter-validation`, `spring-boot-starter-actuator` (health only)
- JUnit 5 + `@WebMvcTest` + `MockMvc`
- No Lombok, no JPA, no Spring Security

## Endpoints

```
POST /api/users        — register a user
GET  /api/users        — list registered users
GET  /actuator/health  — health check
```

See [`../docs/architecture.md`](../docs/architecture.md#rest-api-design) for the full contract.

## Storage

`ConcurrentHashMap<UUID, User>` behind a `UserRepository` interface. **Data is lost on restart.** This is intentional — see [ADR-0001](../docs/adr/0001-deliberately-simple-v1.md).

## Container image

Two stages: `maven:3.9-eclipse-temurin-21` resolves dependencies from `pom.xml` in a cached layer and then runs `mvn package -DskipTests`, and `eclipse-temurin:21-jre` runs the resulting jar as a non-root user.

The builder uses the Maven image rather than `./mvnw` because the wrapper is committed without an executable bit and would download the Maven distribution at build time. `./mvnw` stays authoritative for local builds; the image is pinned to the same Maven 3.9 line.

The image declares a `HEALTHCHECK` against `/actuator/health`, so `docker-compose.yml` can gate the web container on it and Phase 4 gets the same check on EC2 for free. `curl` is installed solely for that check.

The container publishes no port in compose — reach it through the `web` container, or exec into it:

```powershell
docker compose exec api curl -fsS http://localhost:8080/actuator/health
```

Build and run both services from the repository root with `docker compose up --build`; see the [root README](../README.md#both-apps-in-containers).

## Postman collection

`postman/artofreacting-api.postman_collection.json` — importable Postman collection with the two REST endpoints. Set the `baseUrl` collection variable to point at your target environment (default `http://localhost:8080`).
