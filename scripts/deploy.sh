#!/usr/bin/env bash
# Деплой на VDS (shectory-work): вызывается из CursorRPA/scripts/deploy-project.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f "${HOME}/.config/shectory/proxy.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${HOME}/.config/shectory/proxy.env" || true
  set +a
  export HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy || true
fi

if [[ ! -f "${ROOT}/.env" ]]; then
  echo "error: missing ${ROOT}/.env (секреты не в git)"
  exit 1
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git pull --ff-only
fi

npm ci
npm run build

PM2_NAME="shectory-assist-bot"
RUNNER="${ROOT}/scripts/run-prod.sh"
chmod +x "${RUNNER}" 2>/dev/null || true

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
    pm2 restart "${PM2_NAME}" --update-env
  else
    pm2 start "${RUNNER}" --name "${PM2_NAME}" --cwd "${ROOT}"
  fi
  pm2 save || true
  echo "ok: pm2 ${PM2_NAME}"
else
  echo "error: pm2 not found; install: npm i -g pm2"
  exit 1
fi
