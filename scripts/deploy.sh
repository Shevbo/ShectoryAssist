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

# PM2 режет node_args по пробелу; для Node --env-file используем путь без пробелов.
ENV_LINK="${HOME}/.shectory-assist.env"
ln -sf "${ROOT}/.env" "${ENV_LINK}"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git pull --ff-only
fi

npm ci
npm run build

PM2_NAME="shectory-assist-bot"
ECOSYSTEM="${ROOT}/ecosystem.config.cjs"

# Локальный pm2 из npm ci, иначе глобальный / npx.
if [[ -x "${ROOT}/node_modules/.bin/pm2" ]]; then
  PM2=("${ROOT}/node_modules/.bin/pm2")
elif command -v pm2 >/dev/null 2>&1; then
  PM2=(pm2)
elif command -v npx >/dev/null 2>&1; then
  PM2=(npx --yes pm2)
else
  echo "error: need pm2 or npx"
  exit 1
fi

if "${PM2[@]}" describe "${PM2_NAME}" >/dev/null 2>&1; then
  "${PM2[@]}" delete "${PM2_NAME}" 2>/dev/null || true
fi
"${PM2[@]}" start "${ECOSYSTEM}" --only "${PM2_NAME}"
"${PM2[@]}" save 2>/dev/null || true
echo "ok: ${PM2[*]} ${PM2_NAME}"
