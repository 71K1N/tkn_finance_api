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
# .git is not in the build context; pass the commit (e.g. --build-arg GIT_SHA=$(git rev-parse --short HEAD)).
ARG GIT_SHA=
ENV GIT_SHA=$GIT_SHA

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 8081
CMD ["node", "dist/main"]
