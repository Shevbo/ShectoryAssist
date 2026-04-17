#!/usr/bin/env bash
# Деплой на hoster (~/shectory-assist): вызывается из CursorRPA/scripts/deploy-project.sh по SSH.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Один токен = один long poll. PM2 на shectory-work с тем же TELEGRAM_BOT_TOKEN забирает апдейты — бот на hoster «молчит».
if [[ "${USER:-}" == "shectory" && "${ROOT}" == *"Shectory Assist"* && "${SHECTORY_ASSIST_ALLOW_WORK_PM2:-}" != "1" ]]; then
  echo "error: не запускайте PM2 Assist на VDS (shectory-work) с прод-токеном. Прод: hoster ~/shectory-assist. Для осознанного теста: SHECTORY_ASSIST_ALLOW_WORK_PM2=1 ./scripts/deploy.sh"
  exit 1
fi

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
