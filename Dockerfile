# Full-stack build: Angular + Spring Boot in a single JAR
# Build from repo root: docker build -f Dockerfile.fullstack -t stellar-hex .

# Stage 1: Build Angular
FROM node:22-alpine AS angular
WORKDIR /app
COPY package.json package-lock.json ng-openapi-gen.json ./
COPY server/src/main/resources/openapi.yml server/src/main/resources/openapi.yml
RUN npm ci
COPY src ./src
COPY public ./public
COPY angular.json tsconfig.json tsconfig.app.json ./
RUN npm run build

# Stage 2: Build Spring Boot with embedded Angular
FROM gradle:8.12-jdk21 AS build
WORKDIR /app
COPY server/build.gradle.kts server/settings.gradle.kts ./
COPY server/src ./src
# Copy compiled Angular into static resources
COPY --from=angular /app/dist/stellar-hex/browser/ src/main/resources/static/
RUN gradle bootJar --no-daemon -x buildAngular -x copyAngular -x npmInstall

# Stage 3: Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
