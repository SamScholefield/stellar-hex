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
- **Auth**: Keycloak (OIDC/OAuth2)
- **DB**: PostgreSQL (game saves, user data)
- **Containerisation**: Docker Compose for all services

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Angular 21 (existing) |
| BFF/API | Spring Boot 3 + Kotlin |
| Auth | Keycloak 24+ |
| Database | PostgreSQL 16 |
| Build | Gradle (Kotlin DSL) |
| Containers | Docker Compose |
| API Format | REST (JSON), WebSocket for future real-time |

---

## Phased Implementation

### Phase 1: Infrastructure & Project Setup
**Goal**: Monorepo structure, Docker Compose, Spring Boot skeleton, DB schema.

- [ ] Create `/server` directory with Spring Boot + Kotlin + Gradle
- [ ] `build.gradle.kts` with Spring Boot 3, Spring Web, Spring Data JPA, Spring Security, PostgreSQL driver, Jackson Kotlin module
- [ ] Application config (`application.yml`) with DB, Keycloak, CORS settings
- [ ] Docker Compose (`docker-compose.yml` at repo root):
  - `postgres` service (volume-mounted data)
  - `keycloak` service (realm import)
  - `api` service (Spring Boot)
  - `frontend` service (Angular dev server or Nginx)
- [ ] PostgreSQL schema migration (Flyway):
  - `users` table (keycloak_id, display_name, created_at)
  - `game_saves` table (id, user_id, save_name, state_json, camera_json, waypoints_json, created_at, updated_at)
  - `chunk_cache` table (seed, cx, cy, hex_data_json, created_at) — optional, for server-side chunk caching
- [ ] Health check endpoint (`/api/health`)
- [ ] CORS configuration for Angular dev server

### Phase 2: Authentication (Keycloak)
**Goal**: User login/registration, JWT-secured API.

- [ ] Keycloak realm configuration:
  - Realm: `stellar-hex`
  - Client: `stellar-hex-app` (public OIDC client for SPA)
  - Roles: `player` (default)
- [ ] Export realm config JSON for Docker import
- [ ] Spring Security config:
  - OAuth2 Resource Server (JWT validation)
  - Permit `/api/health`, secure all other `/api/**`
  - Extract user ID from JWT claims
- [ ] Angular auth integration:
  - `AuthService` wrapping `keycloak-js` or `angular-oauth2-oidc`
  - Auth guard on `/game` route
  - HTTP interceptor to attach Bearer token
  - Login/logout buttons on menu
- [ ] User entity + repository (JPA)
  - Auto-create user record on first API call (from JWT sub claim)

### Phase 3: World Generation API (Performance)
**Goal**: Offload chunk generation to the server. Primary performance win.

- [ ] Reimplement in Kotlin:
  - `noise.ts` → `NoiseGenerator.kt` (seededRNG, hash3, hashCoord, fbmNoise)
  - `world-generator.service.ts` → `WorldGeneratorService.kt` (generateHex, getNearbySystems, generateAnomaly, generateTradeHub)
  - `hex-math.ts` → `HexMath.kt` (hexToPixel, hexDistance, hexNeighbors, hexesInRange)
- [ ] REST endpoint: `GET /api/world/chunks?seed={seed}&coords={cx,cy;cx,cy;...}`
  - Returns: `{ chunks: [{ cx, cy, hexes: [...] }] }`
  - Server-side chunk caching (in-memory + optional DB)
- [ ] Angular `ChunkManagerService` changes:
  - Replace `this.generator.generate(coord)` with HTTP call
  - Keep client-side chunk cache (Map)
  - Batch requests: request all visible missing chunks in one call
  - `getHex()` — check cache first, fallback to HTTP (or pre-fetch surrounding chunks)
- [ ] Pre-generation on new game:
  - `POST /api/world/pregame` — server generates spawn-area chunks upfront
  - Returns initial chunks + spawn positions
  - Eliminates the initial load delay entirely
- [ ] Determinism tests:
  - Same seed → identical output between TS and Kotlin implementations
  - Port existing world-generator.spec.ts tests to Kotlin (JUnit 5)

### Phase 4: Game State Persistence (Cloud Saves)
**Goal**: Save/load games to PostgreSQL instead of localStorage.

- [ ] REST endpoints:
  - `POST /api/saves` — create new save
  - `GET /api/saves` — list user's saves
  - `GET /api/saves/{id}` — load specific save
  - `DELETE /api/saves/{id}` — delete save
  - `PUT /api/saves/{id}` — update (autosave)
- [ ] Kotlin DTOs mirroring `SerializedGameState`
  - `GameStateDto`, `PlayerDto`, `UnitDto`, `BuildingDto`, etc.
  - Store as JSONB in PostgreSQL for flexibility
- [ ] Angular `GameSaveService` changes:
  - Replace localStorage with HTTP calls
  - Keep localStorage as offline fallback
  - Autosave → `PUT /api/saves/{currentSaveId}`
  - Load game list from server on menu
- [ ] Migration path: import existing localStorage saves to server

### Phase 5: Server-Side Game Reducer (Authoritative State)
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

### Phase 6: Server-Side AI
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

### Phase 7: Containerisation & Deployment
**Goal**: Production-ready Docker setup.

- [ ] Multi-stage Dockerfile for Spring Boot (Gradle build → JRE runtime)
- [ ] Update existing Angular Dockerfile (Nginx)
- [ ] Docker Compose production profile:
  - Environment variables for secrets
  - PostgreSQL volume persistence
  - Keycloak HTTPS configuration
  - Nginx reverse proxy (frontend + API on same domain)
- [ ] CI/CD considerations (GitHub Actions):
  - Build + test Angular
  - Build + test Spring Boot
  - Docker image builds
  - Integration tests

---

## Directory Structure

```
stellar-hex/
├── docker-compose.yml
├── docker-compose.prod.yml
├── src/                          ← Angular (existing)
│   └── app/
├── server/                       ← Spring Boot (new)
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   ├── Dockerfile
│   └── src/
│       ├── main/
│       │   ├── kotlin/com/stellarhex/
│       │   │   ├── StellarHexApplication.kt
│       │   │   ├── config/
│       │   │   │   ├── SecurityConfig.kt
│       │   │   │   └── CorsConfig.kt
│       │   │   ├── auth/
│       │   │   │   ├── UserEntity.kt
│       │   │   │   └── UserRepository.kt
│       │   │   ├── world/
│       │   │   │   ├── WorldController.kt
│       │   │   │   ├── WorldGeneratorService.kt
│       │   │   │   ├── NoiseGenerator.kt
│       │   │   │   └── HexMath.kt
│       │   │   ├── game/
│       │   │   │   ├── GameController.kt
│       │   │   │   ├── GameReducer.kt
│       │   │   │   ├── CombatResolver.kt
│       │   │   │   ├── EconomyService.kt
│       │   │   │   └── InfluenceService.kt
│       │   │   ├── ai/
│       │   │   │   ├── AiController.kt
│       │   │   │   ├── AiService.kt
│       │   │   │   └── AiScoring.kt
│       │   │   ├── saves/
│       │   │   │   ├── SaveController.kt
│       │   │   │   ├── SaveEntity.kt
│       │   │   │   └── SaveRepository.kt
│       │   │   └── model/
│       │   │       ├── GameState.kt
│       │   │       ├── GameAction.kt
│       │   │       ├── HexData.kt
│       │   │       ├── Resources.kt
│       │   │       ├── UnitData.kt
│       │   │       ├── BuildingData.kt
│       │   │       └── Constants.kt
│       │   └── resources/
│       │       ├── application.yml
│       │       └── db/migration/
│       │           ├── V1__create_users.sql
│       │           ├── V2__create_saves.sql
│       │           └── V3__create_chunk_cache.sql
│       └── test/
│           └── kotlin/com/stellarhex/
│               ├── world/WorldGeneratorTest.kt
│               ├── game/GameReducerTest.kt
│               └── game/CombatResolverTest.kt
├── keycloak/
│   └── realm-export.json
├── Dockerfile                    ← Angular (existing)
├── package.json
└── angular.json
```

## Key TypeScript → Kotlin Mappings

| TypeScript Source | Kotlin Target | Notes |
|-------------------|---------------|-------|
| `noise.ts` | `NoiseGenerator.kt` | Pure math, direct port |
| `world-generator.service.ts` | `WorldGeneratorService.kt` | Deterministic, test with same seeds |
| `hex-math.ts` | `HexMath.kt` | Pure coordinate math |
| `game-reducer.ts` | `GameReducer.kt` | Pure state machine |
| `combat-resolver.ts` | `CombatResolver.kt` | Deterministic from seed |
| `economy.service.ts` | `EconomyService.kt` | Pure income/upkeep calc |
| `influence.ts` | `InfluenceService.kt` | Pure influence computation |
| `ai-scoring.ts` | `AiScoring.kt` | Pure scoring functions |
| `game-state.ts` (types) | `model/*.kt` | Data classes |
| `game-state.ts` (constants) | `Constants.kt` | UNIT_STATS, BUILDING_STATS, etc. |
| `actions.ts` | `GameAction.kt` | Sealed class hierarchy |

## Verification per Phase

| Phase | How to verify |
|-------|--------------|
| 1 | `docker-compose up` starts all services, `/api/health` returns 200 |
| 2 | Login via Keycloak, secured endpoints reject unauthenticated requests |
| 3 | Chunk gen via API returns identical data to TypeScript for same seed |
| 4 | Save/load game from menu, data persists across browser sessions |
| 5 | Game actions validated server-side, rejected actions show error |
| 6 | AI turn executes on server, client replays animations |
| 7 | `docker-compose -f docker-compose.prod.yml up` runs full stack |
