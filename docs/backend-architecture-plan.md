# BFF Architecture: Spring Boot + Keycloak + PostgreSQL

## Context
Chunk generation blocks the client main thread for 1-3+ seconds. The primary goal is to offload heavy computation (world gen, AI turns) to a Spring Boot backend. Secondary goals: persistent cloud saves, user authentication via Keycloak, and a foundation for future multiplayer.

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  Angular     │────▶│  Spring Boot  │────▶│  PostgreSQL │
│  (Frontend)  │◀────│  (BFF/API)   │◀────│  (Storage)  │
└─────────────┘     └──────┬───────┘     └────────────┘
                           │
                    ┌──────▼───────┐
                    │   Keycloak    │
                    │   (Auth)     │
                    └──────────────┘
```

- **Monorepo**: `/server` alongside `/src` (Angular)
- **Language**: Kotlin + Spring Boot 3
- **Auth**: Keycloak (OIDC/OAuth2) via BFF session pattern
- **DB**: PostgreSQL (game saves, user data)
- **Containerisation**: Docker Compose for all services

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Angular 21 (existing) |
| BFF/API | Spring Boot 3 + Kotlin |
| Auth | Keycloak 24 (OIDC, BFF session pattern) |
| Database | PostgreSQL 16 |
| Build | Gradle (Kotlin DSL) |
| Containers | Docker Compose |
| API Spec | OpenAPI 3.0 + ng-openapi-gen |
| API Format | REST (JSON), WebSocket for future real-time |

---

## Phased Implementation

### Phase 1: Infrastructure & Project Setup ✅
**Goal**: Monorepo structure, Docker Compose, Spring Boot skeleton, DB schema.

- [x] Create `/server` directory with Spring Boot + Kotlin + Gradle
- [x] `build.gradle.kts` with Spring Boot 3, Spring Web, Spring Data JPA, Spring Security, PostgreSQL driver, Jackson Kotlin module
- [x] Application config (`application.yml`) with DB, Keycloak, CORS settings
- [x] Docker Compose (`docker-compose.yml` at repo root):
  - `postgres` service (volume-mounted data)
  - `keycloak` service (realm import, custom theme)
  - `keycloak-init` sidecar (disables SSL on master realm for dev)
  - `api` service (Spring Boot)
  - `frontend` service (Angular via Nginx, Dockerfile.dev)
- [x] PostgreSQL schema migration (Flyway):
  - `users` table (keycloak_id, display_name, created_at)
  - `game_saves` table (id, user_id, save_name, state_json, camera_json, waypoints_json, created_at, updated_at)
  - Separate `stellarhex_app` schema (avoids Keycloak table conflicts)
- [x] Health check endpoint (`/api/health`)
- [x] CORS configuration for Angular dev server
- [x] OpenAPI spec (`server/src/main/resources/openapi.yml`)
- [x] ng-openapi-gen for Angular API service generation
- [x] Angular proxy config (`proxy.conf.json`) forwarding `/api` to Spring Boot
- [x] `.env` / `.env.example` for secrets (gitignored)

### Phase 2: Authentication (Keycloak) ✅
**Goal**: User login/registration via BFF session pattern.

- [x] Keycloak realm configuration:
  - Realm: `stellar-hex` with custom login theme
  - Client: `stellar-hex-app` (confidential OIDC client)
  - Username-only registration (email/name admin-only)
  - Reset password disabled (no email)
- [x] Export realm config JSON for Docker import
- [x] Spring Security config (BFF pattern, NOT resource server):
  - OAuth2 Client with authorization code flow
  - Session-based auth (server manages sessions, Angular never sees tokens)
  - `Http401EntryPoint` returns JSON 401 for API calls (no redirect)
  - `KeycloakAuthorizationRequestResolver` supports `?action=register`
  - Custom logout handler ends Keycloak session via end_session_endpoint
  - Permit `/api/health`, `/api/auth/me`; secure all other `/api/**`
- [x] Angular auth integration:
  - `AuthService` using generated API services (no keycloak-js dependency)
  - Login/register redirect to BFF OAuth2 endpoints
  - `authGuard` on `/menu`, `/game`; `publicGuard` on `/auth`
  - Styled auth landing page (`/auth`) with Sign In + Register buttons
- [x] User entity + repository (JPA)
  - Auto-create user record on first authenticated request
- [x] Custom Keycloak login theme:
  - Dark theme matching game aesthetics
  - Hex SVG background, noise-texture title animation
  - PF5 layout (parent: keycloak.v2)
  - Custom FTL overrides: tabindex fixes, layout changes
  - Password toggle skipped in tab order

### Phase 3: World Generation API ⚠️ (Mostly Complete)
**Goal**: Offload chunk generation to the server. Primary performance win.

- [x] Reimplement in Kotlin:
  - `noise.ts` → `NoiseGenerator.kt` (seededRNG, hash3, hashCoord, fbmNoise)
  - `world-generator.service.ts` → `WorldGeneratorService.kt` (generateHex, getNearbySystems, generateAnomaly, generateTradeHub)
  - `hex-math.ts` → `HexMath.kt` (hexToPixel, hexDistance, hexNeighbors, hexesInRange)
- [x] REST endpoint: `GET /api/world/chunks?seed={seed}&coords={cx,cy;cx,cy;...}`
  - Server-side in-memory chunk caching (LRU ~500 entries)
- [x] Angular `ChunkManagerService` changes:
  - Fetches chunks from API with local cache
  - `FORCE_LOCAL` flag for dev toggling
  - `serverAvailable` flag auto-disables on first failure
  - Graceful fallback to client-side generation
- [ ] **Determinism tests**: Cross-validate TS vs Kotlin output for same seed
- [ ] **Pre-generation endpoint**: `POST /api/world/pregame` for spawn-area chunks

### Phase 4: Game State Persistence (Cloud Saves) — NOT STARTED
**Goal**: Save/load games to PostgreSQL instead of localStorage.

- [ ] REST endpoints:
  - `POST /api/saves` — create new save
  - `GET /api/saves` — list user's saves
  - `GET /api/saves/{id}` — load specific save
  - `DELETE /api/saves/{id}` — delete save
  - `PUT /api/saves/{id}` — update (autosave)
- [ ] Kotlin DTOs mirroring `SerializedGameState`
  - Store as JSONB in PostgreSQL for flexibility
- [ ] Angular `GameSaveService` changes:
  - Replace localStorage with HTTP calls
  - Keep localStorage as offline fallback
  - Autosave → `PUT /api/saves/{currentSaveId}`
  - Load game list from server on menu
- [ ] Migration path: import existing localStorage saves to server

### Phase 5: Server-Side Game Reducer (Authoritative State) — NOT STARTED
**Goal**: Server validates all game actions. Foundation for multiplayer.

- [ ] Reimplement in Kotlin:
  - `game-reducer.ts` → `GameReducer.kt` (all action handlers)
  - `combat-resolver.ts` → `CombatResolver.kt`
  - `economy.service.ts` → `EconomyService.kt` (income/upkeep)
  - `influence.ts` → `InfluenceService.kt`
  - `game-state.ts` constants → `GameConstants.kt` (UNIT_STATS, BUILDING_STATS, etc.)
- [ ] REST endpoint: `POST /api/game/{saveId}/action`
  - Body: `GameAction` (same shape as TypeScript)
  - Server loads state, applies reducer, persists, returns new state
  - Validates action legality server-side
- [ ] Angular changes:
  - `GameStateService.dispatch()` → POST to server, update local state from response
  - Optimistic updates: apply locally, reconcile on server response
  - Error handling: revert if server rejects action
- [ ] Turn validation:
  - Server enforces turn order
  - Server checks resource sufficiency, unit ownership, range, etc.

### Phase 6: Server-Side AI — NOT STARTED
**Goal**: AI turns execute on server, client just receives the result.

- [ ] Reimplement in Kotlin:
  - `ai-scoring.ts` → `AiScoring.kt` (all scoring functions)
  - `ai.service.ts` → `AiService.kt` (turn execution loop)
- [ ] REST endpoint: `POST /api/game/{saveId}/ai-turn`
  - Server executes full AI turn (all actions)
  - Returns: list of actions taken + resulting state
- [ ] Angular changes:
  - `AIService.executeTurn()` → POST to server
  - Client receives action list, replays animations locally
  - Remove client-side AI scoring/decision logic (keep for offline mode)

### Phase 7: Containerisation & Deployment ⚠️ (Mostly Complete)
**Goal**: Production-ready Docker setup.

- [x] Production Dockerfile: multi-stage Angular + Spring Boot single JAR
- [x] Dockerfile.dev: Angular-only with Nginx (used by docker-compose)
- [x] Gradle build pipeline: Angular build → copy to Spring Boot static resources
- [x] SPA routing via Spring Boot `PathResourceResolver` fallback to index.html
- [x] Environment variables for secrets (`.env` / `.env.example`)
- [ ] Docker Compose production profile (`docker-compose.prod.yml`)
- [ ] Keycloak HTTPS configuration for production
- [ ] CI/CD (GitHub Actions): build, test, Docker image builds

---

## Directory Structure

```
stellar-hex/
├── docker-compose.yml
├── Dockerfile                    ← Production (Angular + Spring Boot JAR)
├── Dockerfile.dev                ← Dev frontend (Nginx)
├── proxy.conf.json               ← Angular dev proxy → Spring Boot
├── .env.example                  ← Environment variables template
├── src/                          ← Angular (existing)
│   └── app/
│       ├── api/                  ← Generated API services (ng-openapi-gen)
│       ├── auth/                 ← Auth landing page
│       └── core/auth/            ← AuthService, auth guards
├── server/                       ← Spring Boot
│   ├── build.gradle.kts
│   ├── Dockerfile                ← API-only Docker build
│   └── src/
│       ├── main/
│       │   ├── kotlin/com/stellarhex/
│       │   │   ├── StellarHexApplication.kt
│       │   │   ├── config/
│       │   │   │   ├── SecurityConfig.kt
│       │   │   │   ├── CorsConfig.kt
│       │   │   │   └── SpaConfig.kt
│       │   │   ├── auth/
│       │   │   │   ├── UserEntity.kt
│       │   │   │   ├── UserRepository.kt
│       │   │   │   └── AuthController.kt
│       │   │   ├── world/
│       │   │   │   ├── WorldController.kt
│       │   │   │   ├── WorldGeneratorService.kt
│       │   │   │   ├── NoiseGenerator.kt
│       │   │   │   ├── HexMath.kt
│       │   │   │   └── ChunkCache.kt
│       │   │   └── saves/
│       │   │       ├── SaveController.kt
│       │   │       ├── SaveEntity.kt
│       │   │       └── SaveRepository.kt
│       │   └── resources/
│       │       ├── application.yml
│       │       ├── application-dev.yml
│       │       ├── openapi.yml
│       │       └── db/migration/
│       │           └── V1__create_schema.sql
│       └── test/
│           └── kotlin/com/stellarhex/
│               └── world/
│                   ├── NoiseGeneratorTest.kt
│                   └── WorldGeneratorTest.kt
├── keycloak/
│   ├── stellar-hex-realm.json
│   ├── disable-ssl.sh
│   └── themes/stellar-hex/
│       └── login/
│           ├── theme.properties
│           ├── login.ftl
│           ├── register.ftl
│           ├── messages/messages_en.properties
│           └── resources/
│               ├── css/stellar-hex.css
│               ├── fonts/DINNextLTPro-Regular.ttf
│               └── img/favicon.svg
└── docs/
    └── backend-architecture-plan.md
```

## Key Design Decisions

| Decision | Planned | Actual | Rationale |
|----------|---------|--------|-----------|
| Auth pattern | JWT Resource Server + keycloak-js | BFF session pattern | Frontend never handles tokens; simpler, more secure |
| API generation | Manual | OpenAPI + ng-openapi-gen | Type-safe, auto-generated Angular services |
| Keycloak client | Public | Confidential | Required for BFF server-side token exchange |
| Flyway schema | Default | Separate `stellarhex_app` schema | Avoids conflicts with Keycloak-managed tables |
| Keycloak SSL | Expected HTTPS | Disabled for dev + init sidecar | IDE port forwarding causes external IP detection |

## Verification per Phase

| Phase | How to verify |
|-------|--------------|
| 1 ✅ | `docker-compose up` starts all services, `/api/health` returns 200 |
| 2 ✅ | Login/register via Keycloak, `/api/auth/me` returns session info |
| 3 ⚠️ | Chunks load from API (network tab), fallback works when API is down |
| 4 | Save/load game from menu, data persists across browser sessions |
| 5 | Game actions validated server-side, rejected actions show error |
| 6 | AI turn executes on server, client replays animations |
| 7 ⚠️ | `docker build -t stellar-hex . && docker run -p 8080:8080 stellar-hex` serves full app |
