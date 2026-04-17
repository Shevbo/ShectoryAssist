#!/usr/bin/env bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node --env-file="${ROOT}/.env" "${ROOT}/apps/bot/dist/index.js"
