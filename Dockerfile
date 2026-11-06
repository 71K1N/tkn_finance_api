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
# Month aggregations resolve their own timezone via APP_TIMEZONE, but keeping the
# container clock aligned makes logs and any remaining local Date usage match.
ENV TZ=America/Sao_Paulo
# .git is not in the build context; pass the commit count (e.g. --build-arg BUILD_NUMBER=$(git rev-list --count HEAD)).
ARG BUILD_NUMBER=
ENV BUILD_NUMBER=$BUILD_NUMBER

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 8081
CMD ["node", "dist/main"]
