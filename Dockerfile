# Stage 1: Build the Angular app
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve the static files
FROM node:22-alpine

WORKDIR /app

RUN npm install -g serve@14

COPY --from=builder /app/browser ./browser

ENV PORT=3000

EXPOSE 3000

CMD serve browser --listen tcp://0.0.0.0:${PORT} --single
