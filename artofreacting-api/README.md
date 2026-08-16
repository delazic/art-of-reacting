# artofreacting-api

Java 21 + Spring Boot 3 REST API for art-of-reacting.

**Status:** Not yet implemented — arrives in **Phase 1**.

## Planned stack

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

## Postman collection

`postman/artofreacting-api.postman_collection.json` — importable Postman collection with the two REST endpoints. Set the `baseUrl` collection variable to point at your target environment (default `http://localhost:8080`).
