import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../src/db";
import { fakeProvider, resetDb, TEST_KEY, testApp } from "./helpers";

// Модели и цены как в seed
const catalog = [
  { id: "gpt-4o-mini", priceInputPer1k: 0.15, priceOutputPer1k: 0.6 },
  { id: "claude-sonnet", priceInputPer1k: 0.9, priceOutputPer1k: 4.5 },
  { id: "gpt-4.1", priceInputPer1k: 0.6, priceOutputPer1k: 2.4 },
];

describe("списание по публичному каталогу", () => {
  beforeEach(async () => {
    await resetDb();
    for (const m of catalog) {
      await prisma.model.create({
        data: {
          ...m,
          title: m.id,
          upstreamModel: m.id,
          maxOutputTokens: 1000,
        },
      });
    }
  });

  for (const { id } of catalog) {
    for (const stream of [false, true]) {
      it(`${id}${stream ? ", стрим" : ""}: сумма совпадает с ценой из /v1/models`, async () => {
        const app = testApp([fakeProvider(["Hello", " world", "!"])]);

        const models = await app.inject({ method: "GET", url: "/v1/models" });
        const entry = models.json().data.find((m: { id: string }) => m.id === id);
        // fakeProvider: 100 входных токенов, 10 выходных на каждый кусок
        const expected =
          (100 * Number(entry.cost_context) + 30 * Number(entry.cost_completion)) /
          1000;

        const res = await app.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: { authorization: `Bearer ${TEST_KEY}` },
          payload: {
            model: id,
            stream,
            messages: [{ role: "user", content: "hi" }],
          },
        });
        expect(res.statusCode).toBe(200);

        const usage = await prisma.usage.findFirstOrThrow({ where: { model: id } });
        expect(usage.cost).toBeCloseTo(expected, 4);
        if (!stream) expect(res.json().usage.total_cost).toBeCloseTo(expected, 4);
      });
    }
  }
});
