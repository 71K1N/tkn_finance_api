#!/usr/bin/env bash
# Publishes the NestJS API build to the Raspberry Pi (pm2 app "api").
#
# Usage:
#   scripts/deploy-rasp.sh              # build, upload, swap, restart (asks before swapping)
#   scripts/deploy-rasp.sh --yes        # same, without the confirmation
#   scripts/deploy-rasp.sh --no-build   # reuse the existing dist/
#   scripts/deploy-rasp.sh --rollback   # swap dist <-> dist.old and restart
#
# The Pi's .env is never touched: it holds the secrets (MONGODB_URI, JWT_SECRET, GOOGLE_CLIENT_ID,
# CORS_ORIGINS, COOKIE_SECURE, ...). New required variables go there by hand (see .env.sample).
# Dependencies are reinstalled on the Pi (npm install --omit=dev) only when package-lock.json changed.
# Rolling back restores dist only; node_modules keeps any newer dependencies, which is harmless.
#
# Auth is an SSH key by default. One-time setup: ssh-copy-id root@192.168.1.6
# Without a key, RASP_PASSWORD_AUTH=1 scripts/deploy-rasp.sh --yes asks for the password instead.
# Overridable: RASP_HOST, RASP_USER, RASP_DIR, RASP_PM2_APP, RASP_PORT (api port), RASP_HEALTH_PATH,
# RASP_NODE_BIN.
set -euo pipefail

RASP_HOST="${RASP_HOST:-192.168.1.6}"
RASP_USER="${RASP_USER:-root}"
RASP_DIR="${RASP_DIR:-/www/api}"
RASP_PM2_APP="${RASP_PM2_APP:-api}"
RASP_PORT="${RASP_PORT:-8081}"
# Any HTTP answer proves the app booted; the route itself needs auth, so 401 is a healthy reply.
RASP_HEALTH_PATH="${RASP_HEALTH_PATH:-/category}"
# pm2 and npm live under nvm on the Pi and are not on a non-interactive shell's PATH.
RASP_NODE_BIN="${RASP_NODE_BIN:-/root/.nvm/versions/node/v24.21.0/bin}"

TARGET="$RASP_USER@$RASP_HOST"
# The Pi is a 1 GB board and its sshd can stall for tens of seconds under load, hence the long timeout.
if [ "${RASP_PASSWORD_AUTH:-0}" = 1 ]; then
    SSH_OPTS=(-o ConnectTimeout=30 -o ServerAliveInterval=15 -o ControlMaster=auto -o ControlPath=/tmp/rasp-cm-%C -o ControlPersist=10m)
    # Git Bash's ssh can't multiplex ("Failed to connect to new control master"): RASP_SSH_MUX=0 drops it.
    [ "${RASP_SSH_MUX:-1}" = 0 ] && SSH_OPTS=(-o ConnectTimeout=30 -o ServerAliveInterval=15)
else
    SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=15)
fi

YES=0; BUILD=1; ROLLBACK=0
for arg in "$@"; do
    case "$arg" in
        --yes|-y) YES=1 ;;
        --no-build) BUILD=0 ;;
        --rollback) ROLLBACK=1 ;;
        *) echo "Unknown option: $arg" >&2; exit 2 ;;
    esac
done

remote() { ssh "${SSH_OPTS[@]}" "$TARGET" "export PATH=\$PATH:$RASP_NODE_BIN; $1"; }

confirm() {
    [ "$YES" -eq 1 ] && return 0
    read -r -p "$1 [y/N] " answer
    [[ "$answer" =~ ^[yYsS]$ ]]
}

if ! ssh "${SSH_OPTS[@]}" "$TARGET" true; then
    echo "Cannot SSH to $TARGET. Key login: run once ssh-copy-id $TARGET. Password login: RASP_PASSWORD_AUTH=1 (and check the user/password)." >&2
    exit 1
fi

# Nest on a loaded Pi 3 takes ~20s to boot, so poll up to ~3 minutes instead of failing early.
health_check() {
    remote "for i in \$(seq 1 36); do
        code=\$(curl -s -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:$RASP_PORT$RASP_HEALTH_PATH || true)
        [ -n \"\$code\" ] && [ \"\$code\" != 000 ] && { echo \"health: \$code (after ~\$((i * 5))s)\"; exit 0; }
        sleep 5
    done
    echo 'health: no answer'; pm2 logs $RASP_PM2_APP --lines 15 --nostream --err 2>&1 | tail -20; exit 1"
}

if [ "$ROLLBACK" -eq 1 ]; then
    confirm "Roll back $RASP_DIR/dist to dist.old on $RASP_HOST?" || exit 1
    remote "set -e; cd $RASP_DIR
        [ -d dist.old ] || { echo 'No dist.old to roll back to'; exit 1; }
        rm -rf dist.bad && mv dist dist.bad && mv dist.old dist && mv dist.bad dist.old
        pm2 restart $RASP_PM2_APP --update-env >/dev/null"
    health_check
    echo "Rolled back."
    exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"

if [ "$BUILD" -eq 1 ]; then
    echo "==> Building"
    rm -rf dist
    npm run build
fi
[ -f dist/main.js ] || { echo "Missing dist/main.js — run without --no-build" >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$STAGE.tgz"' EXIT
cp -r dist "$STAGE/dist"
cp package.json package-lock.json "$STAGE/"

echo "==> Packing"
# --force-local: GNU tar on Windows reads "C:" in a path as a remote host.
tar --force-local -czf "$STAGE.tgz" -C "$STAGE" .

confirm "Deploy to $TARGET:$RASP_DIR and restart '$RASP_PM2_APP'?" || exit 1

echo "==> Uploading"
scp "${SSH_OPTS[@]}" "$STAGE.tgz" "$TARGET:/tmp/api-deploy.tgz"

# The old dist is only replaced after the new one extracted cleanly, so a failed step never leaves the Pi without dist.
echo "==> Swapping and restarting"
remote "set -e; cd $RASP_DIR
    rm -rf deploy.new && mkdir deploy.new && tar -xzf /tmp/api-deploy.tgz -C deploy.new
    [ -f deploy.new/dist/main.js ] || { echo 'Upload is missing dist/main.js'; exit 1; }
    DEPS_CHANGED=1
    cmp -s deploy.new/package-lock.json package-lock.json && DEPS_CHANGED=0
    rm -rf dist.old && mv dist dist.old && mv deploy.new/dist dist
    cp deploy.new/package.json deploy.new/package-lock.json .
    rm -rf deploy.new /tmp/api-deploy.tgz
    if [ \$DEPS_CHANGED = 1 ]; then echo 'package-lock.json changed: installing dependencies'; npm install --omit=dev --no-audit --no-fund 2>&1 | tail -5; fi
    pm2 restart $RASP_PM2_APP --update-env >/dev/null"

if ! health_check; then
    echo "Health check failed. Previous dist is in $RASP_DIR/dist.old; run: scripts/deploy-rasp.sh --rollback" >&2
    exit 1
fi
echo "Deployed API to $TARGET:$RASP_DIR"
