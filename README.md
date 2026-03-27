# Stellar Hex

A hex-based strategy game built with Angular 21, Spring Boot 3 (Kotlin), Keycloak, and PostgreSQL.

## Prerequisites

- Node.js 22+
- Docker & Docker Compose
- Java 21 (for local Gradle builds)

## Quick Start

### 1. Environment Setup

Copy the example env file and adjust if needed:

```bash
cp .env.example .env
```

### 2. Development Modes

#### Frontend Development (recommended for UI work)

Starts PostgreSQL + Keycloak in Docker, Spring Boot API via Docker, Angular dev server separately.

```bash
# Start infrastructure + API
docker compose up -d

# Wait for services, then start Angular dev server
npm start
```

- Angular dev server: `http://localhost:4200`
- API (Spring Boot): `http://localhost:8080`
- Keycloak admin: `http://localhost:9090` (admin/admin)
- Angular proxy forwards `/api` requests to Spring Boot

#### Full-Stack Docker

Runs everything in Docker including a pre-built Angular frontend served by Nginx.

```bash
docker compose up -d
```

- Frontend (Nginx): `http://localhost:80`
- API (Spring Boot): `http://localhost:8080`
- Keycloak admin: `http://localhost:9090` (admin/admin)

#### Full-Stack Single JAR (Production-like)

Builds Angular into the Spring Boot JAR. One artifact serves everything.

```bash
docker build -f Dockerfile.fullstack -t stellar-hex .
docker run -p 8080:8080 stellar-hex
```

- Everything on: `http://localhost:8080`

#### Local Gradle (Spring Boot + embedded Angular)

Builds Angular and embeds it in the Spring Boot app. Requires postgres + keycloak running.

```bash
# Start infrastructure only
docker compose up -d postgres keycloak

# Build and run (includes Angular build)
cd server
./gradlew bootRun --args='--spring.profiles.active=dev --stellarhex.frontend-url=http://localhost:8080'
```

- Everything on: `http://localhost:8080/api` (API) + `http://localhost:8080` (Angular)

## Services

| Service | Port | Description |
|---------|------|-------------|
| Angular dev server | 4200 | Hot-reload frontend (dev only) |
| Spring Boot API | 8080 | BFF + REST API |
| Keycloak | 9090 | Authentication (OIDC) |
| PostgreSQL | 5432 | Database |
| Nginx | 80 | Static frontend (Docker only) |

## Authentication

- Login/registration handled by Keycloak with custom theme
- BFF pattern: Spring Boot manages sessions, Angular never talks to Keycloak directly
- Test user: `testuser` / `testuser`
- Admin: credentials from `.env` (default: admin/admin)

## API

- OpenAPI spec: `server/src/main/resources/openapi.yml`
- Regenerate Angular API services: `npm run api:gen`
- API services auto-regenerate on `npm start` and `npm run build`

## Testing

```bash
# Angular unit tests
npm test

# Run once
npx ng test --watch=false
```

## Project Structure

```
stellar-hex/
├── src/                    # Angular frontend
│   └── app/
│       ├── api/            # Generated API services (ng-openapi-gen)
│       ├── auth/           # Auth landing page
│       ├── core/           # Services (state, AI, audio, camera, etc.)
│       ├── game/           # Game viewport, HUD, panels, overlays
│       ├── guide/          # In-game guide/encyclopedia
│       ├── menu/           # Main menu
│       └── models/         # TypeScript interfaces
├── server/                 # Spring Boot backend (Kotlin)
│   └── src/main/kotlin/com/stellarhex/
│       ├── auth/           # User entity + auth controller
│       ├── config/         # Security, CORS, SPA routing
│       ├── saves/          # Game save persistence
│       └── world/          # World generation API
├── keycloak/               # Keycloak realm config + custom theme
├── docker-compose.yml      # Dev infrastructure
├── Dockerfile              # Angular-only (Nginx)
├── Dockerfile.fullstack    # Angular + Spring Boot single JAR
├── proxy.conf.json         # Angular dev server proxy
└── .env.example            # Environment variables template
```
