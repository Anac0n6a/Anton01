// Расчёт возвратов клиентам. Только чтение БД, ничего не меняет.
//
//   npx tsx scripts/refunds.ts          таблица по организациям
//   npx tsx scripts/refunds.ts --csv    то же в CSV (для финансов)
//
// База берётся из DATABASE_URL (.env). Цены считаются по таблице Model, то есть по публичному
// каталогу, и намеренно не зависят от src/billing/pricing.ts: дальнейшие правки расчёта не
// должны менять смысл «сколько должно было быть списано».
// Округление такое же, как в calcCost: Math.round до 4 знаков на float. У gpt-4o-mini половина
// запросов даёт ровно «ничью» в 5-м знаке, и float часть из них округляет вниз; по точной
// десятичной арифметике (ничья вверх) каталожная стоимость была бы выше, и переплата на
// ~280 тыс. запросов уменьшилась бы примерно на 4 ₽.
//
// Что считаем к возврату:
//   1. Переплата: списано минус стоимость по каталогу, для успешных запросов.
//   2. Списания за неудачные запросы (status = error): возвращаем целиком.
//   3. Запросы инцидента 21.10 (inbox/01): возвращаем целиком, переплату по ним отдельно не считаем.
//
// ВАЖНО: seed считает историю через calcCost. После исправления цен `npm run setup` засеет
// историю уже по каталогу, и переплаты в такой базе не будет, останутся только 4 строки инцидента.
// Для реальной суммы нужна база, засеянная до правки, или прод.
import "dotenv/config";

import { prisma } from "../src/db";

const INCIDENT_21_10: Record<string, string> = {
  "chatcmpl-6b1f0e2a-a91c-4d1e-9f2b-1c0a77e5d301":
    "брошенная попытка SDK (таймаут 10 с)",
  "chatcmpl-0c7d9b44-b2d4-4a8e-8c51-5f3e21a9c442":
    "брошенная попытка SDK (таймаут 10 с)",
  "chatcmpl-91e2c6f0-c7e1-4b0f-a3d2-8e6b4f1d2a77":
    "ответ склеен с заглушкой резерва",
  "chatcmpl-3fa85f64-d5e8-4c2b-b7a1-2c963f66afa6":
    "ошибка, списано по максимуму",
};

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
const rub = (x: number) =>
  x.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface OrgTotals {
  requests: number;
  charged: number;
  catalogOk: number;
  overcharge: number;
  errorRows: number;
  errorSum: number;
  incidentRows: number;
  incidentSum: number;
}

const empty = (): OrgTotals => ({
  requests: 0,
  charged: 0,
  catalogOk: 0,
  overcharge: 0,
  errorRows: 0,
  errorSum: 0,
  incidentRows: 0,
  incidentSum: 0,
});

async function main() {
  const csv = process.argv.includes("--csv");
  const prices = new Map(
    (await prisma.model.findMany()).map((m) => [m.id, m] as const),
  );
  const orgs = await prisma.organization.findMany({ orderBy: { id: "asc" } });

  const totals = new Map<string, OrgTotals>();
  const byModel = new Map<string, { n: number; overcharge: number }>();
  let unknownModel = 0;

  for (const org of orgs) {
    const t = empty();
    totals.set(org.id, t);

    const rows = await prisma.usage.findMany({
      where: { orgId: org.id },
      select: {
        requestId: true,
        model: true,
        promptTokens: true,
        completionTokens: true,
        cost: true,
        status: true,
      },
    });

    for (const row of rows) {
      t.requests += 1;
      t.charged += row.cost;

      if (INCIDENT_21_10[row.requestId]) {
        t.incidentRows += 1;
        t.incidentSum += row.cost;
        continue;
      }
      if (row.status === "error") {
        t.errorRows += 1;
        t.errorSum += row.cost;
        continue;
      }

      const model = prices.get(row.model);
      if (!model) {
        unknownModel += 1;
        continue;
      }
      const catalog = round4(
        (row.promptTokens * model.priceInputPer1k +
          row.completionTokens * model.priceOutputPer1k) /
          1000,
      );
      const diff = row.cost - catalog;
      t.catalogOk += catalog;
      t.overcharge += diff;

      const m = byModel.get(row.model) ?? { n: 0, overcharge: 0 };
      m.n += 1;
      m.overcharge += diff;
      byModel.set(row.model, m);
    }
  }

  const refund = (t: OrgTotals) => t.overcharge + t.errorSum + t.incidentSum;
  const active = [...totals].filter(([, t]) => t.requests > 0);

  if (csv) {
    console.log(
      "org;requests;charged;overcharge;error_rows;error_sum;incident_rows;incident_sum;refund",
    );
    for (const [id, t] of active)
      console.log(
        [
          id,
          t.requests,
          t.charged.toFixed(2),
          t.overcharge.toFixed(2),
          t.errorRows,
          t.errorSum.toFixed(2),
          t.incidentRows,
          t.incidentSum.toFixed(4),
          refund(t).toFixed(2),
        ].join(";"),
      );
    return;
  }

  console.log("Возвраты клиентам, ₽ (переплата по сравнению с каталогом + ошибки + инцидент 21.10)\n");
  console.table(
    Object.fromEntries(
      active.map(([id, t]) => [
        id,
        {
          запросов: t.requests,
          списано: rub(t.charged),
          переплата: rub(t.overcharge),
          "ошибки (шт.)": t.errorRows,
          "ошибки, ₽": rub(t.errorSum),
          "инцидент 21.10, ₽": rub(t.incidentSum),
          "к возврату": rub(refund(t)),
        },
      ]),
    ),
  );
  const all = active.reduce((s, [, t]) => s + refund(t), 0);
  console.log(`\nИтого к возврату: ${rub(all)} ₽`);

  console.log("\nПереплата по моделям (успешные запросы, без инцидента):");
  console.table(
    Object.fromEntries(
      [...byModel].map(([id, m]) => [
        id,
        { запросов: m.n, переплата: rub(m.overcharge) },
      ]),
    ),
  );

  const incident = [...totals.values()].reduce((s, t) => s + t.incidentRows, 0);
  const overcharge = [...totals.values()].reduce((s, t) => s + t.overcharge, 0);
  if (incident > 0 && Math.abs(overcharge) < 100) {
    console.warn(
      "\nВНИМАНИЕ: переплата в истории почти нулевая. Скорее всего, база засеяна уже после " +
        "исправления цен (seed считает историю через calcCost), и реальной переплаты тут нет.",
    );
  }
  if (unknownModel > 0)
    console.warn(`\nПропущено строк с моделью вне каталога: ${unknownModel}`);
}

main().finally(() => prisma.$disconnect());
