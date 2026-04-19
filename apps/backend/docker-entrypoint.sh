#!/usr/bin/env bash
set -euo pipefail

echo "[entrypoint] applying schema with prisma db push"
pnpm exec prisma db push --accept-data-loss --skip-generate

echo "[entrypoint] seed if empty"
node dist/scripts/seedIfEmpty.js || true

echo "[entrypoint] starting server"
exec node dist/server.js
