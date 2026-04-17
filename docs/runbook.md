# Runbook — Shectory Assist (Telegram)

## Локальный запуск

1. Node.js 18.18+.
2. Создай бота у [@BotFather](https://t.me/BotFather), получи токен → `TELEGRAM_BOT_TOKEN` в `.env` (шаблон: `.env.example`).
3. Блок **`AGENT_*`** для Gemini — как в Ourdiary (см. `docs/ADR/0002-gemini-agent-env-proxy.md` и вики `llm-gemini-proxy.md` в репозитории Ourdiary). Секреты не коммитить.
4. `npm install && npm run build`.
5. `BOT_MODE=long_poll` (по умолчанию) — `npm run dev` или `npm run start -w @shectory-assist/bot`.

## Деплой (регламент портала Shectory)

**shectory-work** — только рабочая копия репозитория и git (путь с пробелом допустим). **hoster** — рантайм: Node, **PM2**, файл **`.env`** (секреты не в git).

Первый раз на **hoster**: каталог без пробелов, например `~/shectory-assist` (`git clone … ShectoryAssist.git ~/shectory-assist`), положить **`.env`** в корень клона.

С машины, где настроены `ssh shectory-work` и `ssh hoster`:

```bash
cd /home/shectory/workspaces/CursorRPA
./scripts/deploy-project.sh shectory-assist hoster
```

Скрипт: при необходимости коммит/пуш с **shectory-work** из каталога `Shectory Assist`, затем на **hoster** в `~/shectory-assist`: синхронизация с `origin/main`, `npm ci`, сборка, **PM2** `shectory-assist-bot` из `ecosystem.config.cjs`.

Если раньше бот крутился на VDS с **shectory-work**, останови там процесс (`pm2 delete shectory-assist-bot`), чтобы не было двух экземпляров.

## Allowlist пользователей Telegram

Список разрешённых **numeric user id** ведётся в **Shectory Portal**: [Панель управления](https://shectory.ru/projects/shectory-assist/control) проекта `shectory-assist` (нужна админ-сессия портала). Пока **нет ни одной включённой** записи — бот принимает всех. После появления включённых записей — только они.

На hoster в `.env` бота задай `PORTAL_ALLOWLIST_BASE_URL` и `SHECTORY_AUTH_BRIDGE_SECRET` (тот же секрет, что в `.env` портала на VDS). Опционально: `PORTAL_ALLOWLIST_FAIL_OPEN=false` — при недоступности портала не пускать неизвестных (по умолчанию `true` — не блокировать из‑за сети).

**Доступ к Telegram API:** с hoster/VDS часто **нет** прямого TCP до `api.telegram.org:443`. Тогда long poll и отправка сообщений не работают. Обязательно тот же **`AGENT_PROXY`**, что для Gemini (undici `ProxyAgent` используется и для Bot API, и для скачивания файлов голоса).

## Продакшен (webhook)

1. HTTPS URL, доступный Telegram, например `https://<домен>/telegram/webhook`.
2. Вызов `setWebhook` с тем же путём и при желании **`secret_token`** — его копируй в `TELEGRAM_WEBHOOK_SECRET`; сервер сверяет заголовок **`X-Telegram-Bot-Api-Secret-Token`**.
3. В `.env`: `BOT_MODE=webhook`, `PORT` за reverse-proxy.
4. Long poll и webhook для одного и того же бота не смешивай: при активном webhook getUpdates из другого процесса не используй.

Пример (подставь токен и URL):

```bash
curl -sS "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://example.com/telegram/webhook" \
  -d "secret_token=<тот_же_что_TELEGRAM_WEBHOOK_SECRET>"
```

## Исходящее аудио

После TTS бот пытается отправить **голос** (OGG Opus) или **аудио** (MP3); иначе — **документ** с подписью. Если аудио нет — только текст.

## Типовые инциденты

| Симптом | Действия |
|--------|----------|
| Пустой список заголовков Gazeta | HTTP/редиректы; селекторы в `packages/skills/gazeta`; ADR про парсинг. |
| 401/403 Gemini | `AGENT_LLM_API_KEY`, квоты, модели (`AGENT_GEMINI_*` / `AGENT_LLM_MODEL*`). |
| Нет ответа за прокси | `AGENT_PROXY`, таймауты, доступность прокси с сервера. |
| 401 на webhook | Совпадение `TELEGRAM_WEBHOOK_SECRET` и `secret_token` в `setWebhook`. |
| Дубли ответов | Идемпотентность по ключу `chatId:message_id`; in-memory store сбрасывается при рестарте — для продакшена планируй персистентность. |

## Логи

JSON в stdout, поле `traceId` (префикс `tg-` + `update_id`). Полные транскрипты не логируются — только усечённый фрагмент.
