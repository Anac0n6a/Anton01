import { PrismaClient } from "@prisma/client";

import { calcCost } from "../src/billing/pricing";

const prisma = new PrismaClient();

// Детерминированный генератор, чтобы у всех одинаковые данные
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const models = [
  {
    id: "gpt-4o-mini",
    title: "GPT-4o mini",
    upstreamModel: "gpt-4o-mini",
    priceInputPer1k: 0.15,
    priceOutputPer1k: 0.6,
    maxOutputTokens: 4096,
  },
  {
    id: "gpt-4.1",
    title: "GPT-4.1",
    upstreamModel: "gpt-4.1",
    priceInputPer1k: 0.6,
    priceOutputPer1k: 2.4,
    maxOutputTokens: 8192,
  },
  {
    id: "claude-sonnet",
    title: "Claude Sonnet 4.5",
    upstreamModel: "claude-sonnet-4-5",
    priceInputPer1k: 0.9,
    priceOutputPer1k: 4.5,
    maxOutputTokens: 8192,
  },
  {
    id: "deepseek-flash",
    title: "DeepSeek V4 Flash",
    upstreamModel: "deepseek-v4-flash",
    priceInputPer1k: 0.04,
    priceOutputPer1k: 0.12,
    maxOutputTokens: 8192,
  },
];

const orgs = [
  {
    id: "alfa-retail",
    name: "Альфа-Ритейл",
    creditLimit: 50_000,
    deposit: 1_500_000,
    history: 300_000,
  },
  {
    id: "integrosoft",
    name: "ИнтегроСофт (реселлер)",
    creditLimit: 20_000,
    deposit: 400_000,
    history: 60_000,
  },
  {
    id: "pixel-studio",
    name: "Студия Пиксель",
    creditLimit: 0,
    deposit: 15_000,
    history: 2_000,
  },
  {
    id: "nova-bank",
    name: "Нова Банк (пилот)",
    creditLimit: 10_000,
    deposit: 0,
    history: 0,
  },
  { id: "demo", name: "Демо", creditLimit: 0, deposit: 1_000, history: 0 },
];

const keys = [
  {
    id: "key_alfa_search",
    orgId: "alfa-retail",
    name: "search-team",
    key: "sk-alfa-search-7f3c2a91",
  },
  {
    id: "key_alfa_support",
    orgId: "alfa-retail",
    name: "support-bot",
    key: "sk-alfa-support-41be09d2",
  },
  {
    id: "key_alfa_analytics",
    orgId: "alfa-retail",
    name: "analytics",
    key: "sk-alfa-analytics-c08d5e17",
  },
  {
    id: "key_integro_main",
    orgId: "integrosoft",
    name: "main",
    key: "sk-integro-main-9a6f3b40",
  },
  {
    id: "key_pixel_main",
    orgId: "pixel-studio",
    name: "main",
    key: "sk-pixel-main-2d7e8c55",
  },
  {
    id: "key_nova_pilot",
    orgId: "nova-bank",
    name: "pilot",
    key: "sk-nova-pilot-e5a1f0c3",
  },
  { id: "key_demo", orgId: "demo", name: "demo", key: "sk-demo-00000000" },
];

// Списания инцидента 21.10.2026 (см. inbox/ и logs/)
const incident = [
  {
    requestId: "chatcmpl-6b1f0e2a-a91c-4d1e-9f2b-1c0a77e5d301",
    apiKeyId: "key_alfa_search",
    provider: "gptunnel",
    promptTokens: 1850,
    completionTokens: 1412,
    cost: 1.3496,
    status: "ok",
    createdAt: "2026-10-21T15:41:21.540Z",
  },
  {
    requestId: "chatcmpl-0c7d9b44-b2d4-4a8e-8c51-5f3e21a9c442",
    apiKeyId: "key_alfa_search",
    provider: "gptunnel",
    promptTokens: 1850,
    completionTokens: 1388,
    cost: 1.3324,
    status: "ok",
    createdAt: "2026-10-21T15:41:30.913Z",
  },
  {
    requestId: "chatcmpl-91e2c6f0-c7e1-4b0f-a3d2-8e6b4f1d2a77",
    apiKeyId: "key_alfa_search",
    provider: "reserve",
    promptTokens: 2010,
    completionTokens: 24,
    cost: 0.3791,
    status: "ok",
    createdAt: "2026-10-21T15:41:41.322Z",
  },
  {
    requestId: "chatcmpl-3fa85f64-d5e8-4c2b-b7a1-2c963f66afa6",
    apiKeyId: "key_alfa_support",
    provider: "none",
    promptTokens: 1210,
    completionTokens: 4096,
    cost: 3.1669,
    status: "error",
    createdAt: "2026-10-21T16:05:47.808Z",
  },
];

async function main() {
  await prisma.usage.deleteMany();
  await prisma.deposit.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.model.deleteMany();

  await prisma.model.createMany({ data: models });
  await prisma.organization.createMany({
    data: orgs.map(({ id, name, creditLimit }) => ({
      id,
      name,
      creditLimit,
      createdAt: new Date("2026-03-01T09:00:00Z"),
    })),
  });
  await prisma.apiKey.createMany({
    data: keys.map((k) => ({
      ...k,
      createdAt: new Date("2026-03-01T09:00:00Z"),
    })),
  });
  await prisma.deposit.createMany({
    data: orgs
      .filter((o) => o.deposit > 0)
      .map((o) => ({
        orgId: o.id,
        amount: o.deposit,
        createdAt: new Date("2026-03-01T09:00:00Z"),
      })),
  });

  const random = rng(42);
  const from = new Date("2026-04-01T00:00:00Z").getTime();
  const to = new Date("2026-10-21T15:00:00Z").getTime();

  for (const org of orgs) {
    if (!org.history) continue;
    const orgKeys = keys.filter((k) => k.orgId === org.id);
    process.stdout.write(`История ${org.name}: ${org.history} запросов… `);

    const batchSize = 5_000;
    for (let offset = 0; offset < org.history; offset += batchSize) {
      const rows = [];
      for (let i = offset; i < Math.min(offset + batchSize, org.history); i++) {
        const model =
          models[Math.floor(random() * (random() < 0.7 ? 1 : models.length))];
        const promptTokens = 200 + Math.floor(random() * 3000);
        const completionTokens = 50 + Math.floor(random() * 1200);
        const cost = calcCost(model, { promptTokens, completionTokens });
        rows.push({
          requestId: `chatcmpl-hist-${org.id}-${i}`,
          orgId: org.id,
          apiKeyId: orgKeys[Math.floor(random() * orgKeys.length)].id,
          model: model.id,
          provider: "gptunnel",
          promptTokens,
          completionTokens,
          cost,
          status: "ok",
          // История растёт к концу периода
          createdAt: new Date(from + Math.sqrt(i / org.history) * (to - from)),
        });
      }
      await prisma.usage.createMany({ data: rows });
    }
    console.log("готово");
  }

  await prisma.usage.createMany({
    data: incident.map((row) => ({
      ...row,
      orgId: "alfa-retail",
      model: "gpt-4o-mini",
      createdAt: new Date(row.createdAt),
    })),
  });

  console.log("\nКлючи API:");
  for (const k of keys)
    console.log(`  ${k.orgId.padEnd(14)} ${k.name.padEnd(14)} ${k.key}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
