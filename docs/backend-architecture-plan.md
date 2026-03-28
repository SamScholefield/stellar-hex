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

### Phase 3: World Generation API ✅
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

### Phase 4: Game State Persistence (Cloud Saves) ✅
**Goal**: Save/load games to PostgreSQL instead of localStorage.

- [x] REST endpoints:
  - `POST /api/saves` — create new save
  - `GET /api/saves` — list user's saves
  - `GET /api/saves/{id}` — load specific save
  - `DELETE /api/saves/{id}` — delete save
  - `PUT /api/saves/{id}` — update (autosave)
- [x] Kotlin DTOs mirroring `SerializedGameState`
  - Stored as TEXT in PostgreSQL (state_json, camera_json, waypoints_json)
- [x] Angular `GameSaveService` changes:
  - Server-first with localStorage offline fallback
  - Autosave → `PUT /api/saves/{currentSaveId}`
  - Load game list from server on menu
  - `deleteById()` removes from server DB
- [x] Flyway migrations: V1 users, V2 game_saves, V3 chunk_cache, V4 text columns

### Phase 5: Server-Side Game Reducer & Action Sync ✅
**Goal**: Server mirrors all game actions. Foundation for multiplayer.

- [x] Reimplement in Kotlin:
  - `game-reducer.ts` → `GameReducer.kt` (all 14 action handlers, 930 lines)
  - `combat-resolver.ts` → `CombatResolver.kt` (unit-vs-unit, unit-vs-building, XP/promotion)
  - `economy.service.ts` → `EconomyService.kt` (income, mining drone yields, upkeep, net income)
  - `influence.ts` → `InfluenceService.kt` (influence spheres, enemy proximity)
  - `game-state.ts` constants → `GameModels.kt` (UNIT_STATS, BUILDING_STATS, TECH_TREE, WEAPON_STATS, etc.)
- [x] REST endpoint: `POST /api/game/action`
  - Body: `ActionRequest { state: String, action: GameAction }`
  - Jackson polymorphic deserialization via `@JsonTypeInfo` on sealed class
  - Returns: `ActionResponse { state: String }`
- [x] Angular changes:
  - `GameStateService.dispatch()` applies locally, then fire-and-forget POST with pre-action state
  - `serializeState()` / `serializeAction()` handle Map→tuple, Set→array conversion
  - `serverAvailable` flag auto-disables on network failure
  - Error logging in browser console for non-zero HTTP errors
- [x] Serialization layer:
  - `SerializedGameState` DTO with `List<List<Any>>` for JS Map tuple format
  - `toGameState()` / `toSerializedState()` conversion functions
  - `seed` as `Long` to handle `Date.now()` timestamps exceeding Int range
- [ ] **Not yet authoritative**: server mirrors but frontend is still source of truth

### Phase 6: Server-Side AI ✅
**Goal**: AI turns execute on server, client receives the result.

- [x] Reimplement in Kotlin:
  - `ai-scoring.ts` → `AiScoring.kt` (scoreExplore, scoreAttack, scoreBuild, scoreProduction, scoreResearch)
  - `ai.service.ts` → `AiService.kt` (turn execution loop with unit prioritisation, pathfinding)
  - Inline A* pathfinding in AiService (findPartialPath, findUnboundedPath, pathCost)
- [x] REST endpoint: `POST /api/game/ai-turn`
  - Body: `AiTurnRequest { state: String, playerId: String }`
  - Server builds hex lookup via WorldGeneratorService, executes full AI turn
  - Returns: `AiTurnResponse { state: String }`
- [x] Angular changes:
  - `AIService.tryServerAiTurn()` attempts server-side execution first
  - Falls back to local AI on failure (`serverAvailable` flag)
  - Deserializes server response via `GameSaveService.deserialize()`
- [ ] **Action replay**: Server currently returns final state only, not action list for animation replay

---

## Multiplayer Phases (NEW)

The following phases move the architecture from **mirror mode** (frontend is source of truth, server shadows) to **authoritative mode** (server is source of truth, frontend is a view).

### Phase 7: Authoritative Server State
**Goal**: Server becomes the single source of truth. Frontend dispatches actions, server validates and returns results.

**Current state**: Frontend applies actions locally, then fire-and-forget syncs to server. Server mirrors but doesn't enforce. Frontend ignores server response.

- [ ] Server-side game session management:
  - `GameSession` entity (or in-memory): holds current `GameState` per active game
  - Link sessions to saves — `POST /api/game/start` loads save into session
  - `POST /api/game/{sessionId}/action` — server applies action to its authoritative state
  - `POST /api/game/{sessionId}/end-turn` — server runs end-turn logic including mining yields
- [ ] Angular changes:
  - `dispatch()` sends action to server, waits for response, replaces local state
  - Optimistic local apply with rollback on server rejection
  - Remove pre-action state serialisation (server owns the state)
- [ ] Server computes derived data currently frontend-only:
  - `miningYields` (requires hex lookup via WorldGeneratorService)
  - `impassableHexes` near buildings with production queues
- [ ] Turn enforcement:
  - Server tracks `currentPlayerIndex`, rejects actions from wrong player
  - Server auto-advances turn on END_TURN

### Phase 8: Server-Side Vision & Fog of War
**Goal**: Server enforces what each player can see. Prevents information leaks in multiplayer.

**Current state**: `VisionService` (frontend-only) computes visible hexes from unit/building sight ranges. `UPDATE_EXPLORED` dispatched client-side. Server stores explored hexes but doesn't compute visibility.

- [ ] Kotlin `VisionService`:
  - `computeVisibleHexes(state, playerId)` → `Set<String>` using unit/building sightRange + tech bonuses
  - `computeNewDiscoveries(state, playerId, previousExplored)` → new hex keys
- [ ] Server auto-triggers on state changes:
  - After MOVE_UNIT: recompute visibility, auto-dispatch UPDATE_EXPLORED
  - After BUILD: new building extends vision
  - After END_TURN: units may have moved (production spawn)
- [ ] State filtering in API responses:
  - `filterStateForPlayer(state, playerId, visibleHexes)` strips invisible units/buildings
  - Only return hex data the player has explored
  - Opponents' units only visible within fog-of-war range
- [ ] Auto-discovery:
  - Server triggers DISCOVER_ANOMALY / DISCOVER_TRADE_HUB when unit vision reveals them
  - Remove client-side discovery dispatching (game.component.ts discovery effect)

### Phase 9: Server-Side Pathfinding & Move Validation
**Goal**: Server validates that movement paths are legal. Prevents impossible moves.

**Current state**: Frontend computes paths via `hex-pathfinder.ts` (A* with binary heap). Server accepts any path in MOVE_UNIT without validation. AI has inline pathfinding.

- [ ] Kotlin `HexPathfinder`:
  - Extract AI's inline A* into reusable `HexPathfinder.kt`
  - `findPath(from, to, mp, hexLookup, costOverride)` → path or null
  - `pathCost(path, hexLookup, costOverride)` → movement cost
  - `getReachableHexes(from, mp, hexLookup, costOverride)` → flood-fill for range display
- [ ] MOVE_UNIT validation in GameReducer:
  - Verify path is contiguous (each step is a hex neighbour)
  - Verify path cost matches claimed cost (±tolerance for rounding)
  - Verify no blocked hexes (enemies, impassable terrain) along path
  - Verify unit has sufficient MP
- [ ] API for client pathfinding (optional, reduces client computation):
  - `POST /api/game/{sessionId}/pathfind` — returns optimal path for a unit
  - `POST /api/game/{sessionId}/reachable` — returns set of reachable hexes for range display

### Phase 10: Game Initialisation & Lobby
**Goal**: Server creates and manages new games. Foundation for multiplayer lobby.

**Current state**: `GameInitService` (frontend-only) creates initial state with spawn positions, starting units/buildings. No server endpoint.

- [ ] Kotlin `GameInitService`:
  - Port spawn-near-planet logic from frontend
  - Deterministic spawn placement from seed
  - Starting resources, units (scout), buildings (starbase) per player
- [ ] REST endpoints:
  - `POST /api/game/create` — create new game (seed, player count, player names/colours)
  - Returns: `{ sessionId, state }` with initial state
  - `POST /api/game/{sessionId}/join` — join an existing game (multiplayer)
  - `GET /api/game/{sessionId}/state` — poll current state (or WebSocket)
- [ ] Multiplayer lobby:
  - Game creation with invite codes or matchmaking
  - Player ready state
  - Spectator support
- [ ] Waypoint persistence (optional):
  - `POST /api/game/{sessionId}/waypoints` — store unit orders server-side
  - Auto-execute waypoints during turn processing

### Phase 11: Real-Time Communication (WebSocket)
**Goal**: Push state updates to all players instead of polling. Required for responsive multiplayer.

- [ ] Spring WebSocket + STOMP:
  - `/ws/game/{sessionId}` — per-game WebSocket channel
  - Server pushes: state updates, turn changes, opponent actions, chat
  - Client subscribes on game join, reconnects on disconnect
- [ ] Message types:
  - `STATE_UPDATE` — filtered state for the receiving player
  - `TURN_CHANGE` — whose turn it is now
  - `ACTION_RESULT` — action accepted/rejected with reason
  - `AI_TURN_COMPLETE` — AI finished, here's what happened
  - `GAME_OVER` — victory/defeat notification
- [ ] Angular WebSocket client:
  - Replace fire-and-forget HTTP POST with WebSocket send
  - Listen for state updates, apply to local state
  - Reconnection with state resync on dropped connection
- [ ] Fallback: keep HTTP POST working for degraded connectivity

### Phase 12: Containerisation & Deployment ⚠️ (Mostly Complete)
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

## Current Server Coverage (Post Phase 6)

| System | Server | Frontend | Status |
|--------|--------|----------|--------|
| GameReducer (14 actions) | ✅ 930 lines | ✅ 904 lines | Mirrored, not authoritative |
| CombatResolver | ✅ 249 lines | ✅ | Parity |
| EconomyService | ✅ 87 lines | ✅ | Parity |
| InfluenceService | ✅ 55 lines | ✅ | Parity |
| AiService + AiScoring | ✅ 970 lines | ✅ | Server-first with fallback |
| WorldGenerator + Noise | ✅ | ✅ | Server-first with fallback |
| Cloud Saves (CRUD) | ✅ | ✅ | Server-first with fallback |
| Auth (Keycloak BFF) | ✅ | ✅ | Complete |
| **Vision / Fog of War** | ❌ | ✅ | Phase 8 |
| **Pathfinding (general)** | ❌ (AI-only) | ✅ | Phase 9 |
| **Move Validation** | ❌ | ✅ | Phase 9 |
| **Game Initialisation** | ❌ | ✅ | Phase 10 |
| **Turn Enforcement** | ❌ | ✅ (client) | Phase 7 |
| **Waypoint Persistence** | ❌ | ✅ (local) | Phase 10 |
| **WebSocket / Real-time** | ❌ | ❌ | Phase 11 |

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
│       ├── core/auth/            ← AuthService, auth guards
│       └── core/state/           ← state-serialization.ts (Map/Set ↔ JSON)
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
│       │   │   │   ├── SpaConfig.kt
│       │   │   │   └── ErrorLoggingAdvice.kt
│       │   │   ├── auth/
│       │   │   │   ├── UserEntity.kt
│       │   │   │   ├── UserRepository.kt
│       │   │   │   └── AuthController.kt
│       │   │   ├── game/
│       │   │   │   ├── GameController.kt    ← /action + /ai-turn endpoints
│       │   │   │   ├── GameAction.kt        ← Sealed class, 14 action types
│       │   │   │   ├── GameReducer.kt       ← Pure reducer (930 lines)
│       │   │   │   ├── CombatResolver.kt
│       │   │   │   ├── EconomyService.kt
│       │   │   │   └── InfluenceService.kt
│       │   │   ├── ai/
│       │   │   │   ├── AiService.kt         ← Full AI turn execution
│       │   │   │   └── AiScoring.kt         ← Scoring functions
│       │   │   ├── model/
│       │   │   │   ├── GameModels.kt        ← All game types + constants
│       │   │   │   └── WorldModels.kt       ← Chunk/hex DTOs
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
│       │           ├── V1__create_users.sql
│       │           ├── V2__create_game_saves.sql
│       │           ├── V3__create_chunk_cache.sql
│       │           └── V4__alter_saves_text_columns.sql
│       └── test/
│           └── kotlin/com/stellarhex/
│               ├── StellarHexApplicationTest.kt
│               └── game/
│                   ├── ActionDeserializationTest.kt
│                   └── SpringObjectMapperTest.kt
├── keycloak/
│   ├── stellar-hex-realm.json
│   ├── disable-ssl.sh
│   └── themes/stellar-hex/
│       └── login/
│           ├── theme.properties
│           ├── login.ftl
│           ├── register.ftl
│           ├── field.ftl
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
| State sync | Server authoritative | Mirror mode (fire-and-forget) | Pragmatic first step; authoritative in Phase 7 |
| AI execution | Server-only | Server-first with local fallback | Graceful degradation when server unavailable |
| Seed type | Int | Long | `Date.now()` exceeds Int.MAX_VALUE; Long in DTOs, .toInt() at noise boundaries |
| Action serialization | — | Polymorphic sealed class + @JsonTypeInfo | Clean discriminated union mapping for all 14 action types |

## Verification per Phase

| Phase | How to verify |
|-------|--------------|
| 1 ✅ | `docker-compose up` starts all services, `/api/health` returns 200 |
| 2 ✅ | Login/register via Keycloak, `/api/auth/me` returns session info |
| 3 ✅ | Chunks load from API (network tab), fallback works when API is down |
| 4 ✅ | Save/load/delete from menu, data persists in PostgreSQL across sessions |
| 5 ✅ | Actions sync to server (200 in network tab), server logs action types |
| 6 ✅ | AI turn executes on server, falls back to local on failure |
| 7 | Server rejects actions from wrong player; dispatch awaits server response |
| 8 | Opponent units hidden outside fog; anomalies auto-discovered server-side |
| 9 | Server rejects impossible MOVE_UNIT paths; pathfind API returns valid routes |
| 10 | `POST /api/game/create` returns initial state; multiplayer join works |
| 11 | State updates arrive via WebSocket without polling |
| 12 ⚠️ | `docker build -t stellar-hex . && docker run -p 8080:8080 stellar-hex` serves full app |
