# syntax=docker/dockerfile:1

# Using bookworm-slim (glibc) rather than alpine for reliable arm/v7 (Raspberry Pi 3) support.
FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 8081
CMD ["node", "dist/main"]
