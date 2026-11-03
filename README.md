# API Gateway (песочница)

Упрощённый гейтвей к языковым моделям: OpenAI-совместимый API для внешних клиентов,
биллинг по токенам, ключи, баланс организаций и мини-кабинет.

Это учебный проект для технического интервью. Задание — в [TASK.md](TASK.md).

## Запуск

Нужен Node.js 20+.

```bash
cp .env.example .env      # впиши GPTUNNEL_API_KEY, который выдали на встрече
npm install
npm run setup             # создаст SQLite-базу и наполнит её данными (~10 секунд)
npm run dev               # http://localhost:3000
```

Проверка:

```bash
curl -N http://localhost:3000/v1/chat/completions \
  -H 'Authorization: Bearer sk-demo-00000000' \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"Привет"}]}'
```

Тесты и типы: `npm test`, `npm run typecheck`.

Клиентский SDK: `npm run sdk:example -- <ключ> "<вопрос>"`.

Кабинет: `cd web && npm install && npm run dev` (http://localhost:5173, нужен запущенный гейтвей).

## Устройство

```
src/
  server.ts            точка входа, сборка провайдеров
  app.ts               Fastify-приложение
  routes/chat.ts       POST /v1/chat/completions (стрим и обычный ответ)
  routes/models.ts     GET /v1/models — публичный каталог с ценами
  routes/admin.ts      /admin/* — для кабинета и поддержки (заголовок x-admin-token)
  billing/             баланс, цены, списания
  providers/           провайдеры моделей, фолбэк, деградации для песочницы
prisma/
  schema.prisma        модель данных
  seed.ts              данные песочницы
sdk/                   официальный JS-клиент, через который ходят клиенты
web/                   кабинет (React + Vite)
test/                  тесты (vitest, провайдер-заглушка)
inbox/                 входящие от клиентов и коллег
logs/                  логи прода за 21.10
```

### Провайдеры

- `gptunnel` — основной, настоящий OpenAI-совместимый API (ключ в `.env`).
- `reserve` — резервный. В песочнице это заглушка с шаблонным ответом.

Запрос идёт в основной провайдер, при ошибке — в резервный (`providers/router.ts`).

### Деградации провайдеров

В проде провайдеры иногда тормозят и рвут стримы. В песочнице это включается
переменными окружения (см. `.env.example`):

| Переменная | Что делает |
|---|---|
| `CHAOS_FIRST_TOKEN_DELAY_MS` | задержка основного провайдера перед ответом |
| `CHAOS_MIDSTREAM_FAIL_RATE` | доля стримов основного провайдера, которые рвутся посередине |
| `CHAOS_MIDSTREAM_FAIL_AFTER_CHUNKS` | после какого чанка рвётся стрим |
| `CHAOS_RESERVE_FAIL_RATE` | доля запросов к резервному провайдеру, которые получают 429 |

Пример: `CHAOS_MIDSTREAM_FAIL_RATE=1 npm run dev`.

### Данные песочницы

`npm run setup` печатает ключи всех организаций. У Альфа-Ритейл история около
300 тысяч запросов, у остальных меньше. Списания инцидента 21.10 тоже есть в базе.
