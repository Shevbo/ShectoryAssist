# Shectory Assist

Голосовой бот в **Telegram** с цепочкой **ASR → NLU → навыки → TTS** на **Google Gemini** и расширяемыми **skills**. Интеграция с **Max** временно отложена (раньше использовался `packages/adapters/max`, каталог удалён из сборки).

Продуктовое ТЗ изначально под Max: [`ТЗ на Shectory Assist.md`](./ТЗ%20на%20Shectory%20Assist.md) — сценарии и оркестрация остаются актуальными, меняется только транспорт входа/выхода (сейчас Telegram Bot API через [grammy](https://grammy.dev/)).

## Структура репозитория

- `apps/bot` — Telegram-бот: long polling (`grammy`) или HTTP (`/health`, `POST /telegram/webhook`).
- `packages/core` — оркестратор, типы `SkillInput` / `SkillOutput`, маршрутизация intent, лимиты, логирование.
- `packages/adapters/gemini` — REST к Gemini через undici и опциональный прокси (`AGENT_*`).
- `packages/skills/gazeta` — навык `gazeta_picture_of_day`.

## Быстрый старт

1. Скопируй `.env.example` в `.env`, задай **`TELEGRAM_BOT_TOKEN`** и блок **`AGENT_*`** для Gemini (см. `docs/ADR/0002-gemini-agent-env-proxy.md`).
2. `npm install && npm run build`
3. `npm run dev` — long polling к Telegram.

Подробности: [`docs/runbook.md`](./docs/runbook.md).

## Команды

| Команда         | Назначение        |
|----------------|-------------------|
| `npm run build` | Сборка пакетов    |
| `npm test`      | Юнит-тесты        |
| `npm run lint`  | ESLint            |
| `npm run dev`   | Запуск бота (tsx) |

## Документация

- [Runbook](./docs/runbook.md)
- [ADR](./docs/ADR/)
- [Модель угроз](./docs/threat-model.md)
