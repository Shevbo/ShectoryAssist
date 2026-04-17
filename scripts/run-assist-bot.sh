#!/usr/bin/env bash
# Запуск под PM2: дочерний процесс не должен тащить HTTP(S)_PROXY от демона PM2 —
# иначе Node/undici ведут себя иначе, чем у интерактивного nohup (getMe «висит»).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy 2>/dev/null || true
exec node --env-file="$ROOT/.env" "$ROOT/apps/bot/dist/index.js"
