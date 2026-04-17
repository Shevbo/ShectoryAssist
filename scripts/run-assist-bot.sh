#!/usr/bin/env bash
# Запуск под PM2: обходим связку interpreter=node + node_args=--env-file (на hoster она «висела» на getMe/deleteWebhook).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
exec node --env-file="$ROOT/.env" "$ROOT/apps/bot/dist/index.js"
