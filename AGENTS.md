# Правила проекта для агентов

- Стек: Node.js 20, TypeScript, Fastify 4, Prisma 5 + SQLite, vitest. Кабинет: React 18 + Vite.
- Команды: `npm run dev`, `npm test`, `npm run typecheck`, `npm run setup` (пересоздаёт данные).
- Схема БД в `prisma/schema.prisma`; после изменения — `npx prisma db push`.
- Деньги в рублях, цены моделей — за 1000 токенов.
- Формат ответов и ошибок совместим с OpenAI Chat Completions.
- Тесты не ходят в сеть: используй `fakeProvider` из `test/helpers.ts`.
