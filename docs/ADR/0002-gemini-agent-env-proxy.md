# ADR 0002: переменные `AGENT_*` и прокси для Gemini

## Контекст

В экосистеме Shectory (Ourdiary, пакет `@shectory/gemini-proxy`) вызовы Gemini идут через **undici** с опциональным **ProxyAgent**, секреты унифицированы под префиксом `AGENT_*`.

## Решение

1. Основной ключ: **`AGENT_LLM_API_KEY`** (допустим fallback `GEMINI_API_KEY` до полной миграции).
2. Прокси: **`AGENT_PROXY`** или **`AGENT_HTTPS_PROXY`** / **`AGENT_HTTP_PROXY`** — тот же приоритет, что в `@shectory/gemini-proxy`.
3. База URL: **`AGENT_LLM_BASE_URL`** с нормализацией суффикса `/openai` к нативному `…/v1beta`, как в Ourdiary.
4. Таймауты: **`AGENT_LLM_TIMEOUT_MS`**, **`AGENT_PROXY_CONNECT_TIMEOUT_MS`**.
5. Модели: приоритет `AGENT_GEMINI_*` → устаревшие `GEMINI_*` → **`AGENT_LLM_MODEL_FAST`** / **`AGENT_LLM_MODEL`** (как в `.env` Ourdiary).

Реализация: `packages/adapters/gemini/src/gemini-fetch.ts` (обёртка над `undici`).

## Статус

Принято; дублировать пакет `@shectory/gemini-proxy` в виде npm-зависимости между репозиториями не требуется — логика совпадает.

## Ссылки

- Вики Ourdiary: `ourdiary/docs/wiki/llm-gemini-proxy.md` (в соседнем репозитории).
