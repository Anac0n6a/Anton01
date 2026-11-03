import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBalance } from "../src/billing/balance";
import { prisma } from "../src/db";
import { resetDb } from "./helpers";

function usage(orgId: string, apiKeyId: string, cost: number) {
  return {
    requestId: `chatcmpl-${Math.random()}`,
    orgId,
    apiKeyId,
    model: "test-model",
    provider: "fake",
    promptTokens: 1,
    completionTokens: 1,
    cost,
    status: cost ? "ok" : "error",
  };
}

describe("getBalance", () => {
  beforeEach(resetDb);
  afterEach(() => vi.restoreAllMocks());

  it("пополнения минус списания только своей организации", async () => {
    await prisma.organization.create({ data: { id: "other", name: "Other" } });
    await prisma.apiKey.create({
      data: { id: "other-key", orgId: "other", name: "o", key: "sk-other" },
    });
    await prisma.deposit.createMany({
      data: [
        { orgId: "org", amount: 50 },
        { orgId: "other", amount: 1000 },
      ],
    });
    await prisma.usage.createMany({
      data: [
        usage("org", "key", 1.25),
        usage("org", "key", 0.75),
        usage("org", "key", 0),
        usage("other", "other-key", 500),
      ],
    });

    // resetDb уже положил org 100 ₽
    expect(await getBalance("org")).toBeCloseTo(148, 4);
    expect(await getBalance("other")).toBeCloseTo(500, 4);
  });

  it("организация без пополнений и списаний — 0", async () => {
    await prisma.organization.create({ data: { id: "empty", name: "Empty" } });
    expect(await getBalance("empty")).toBe(0);
  });

  // Регрессия 21.10: у Альфы 300 тыс. списаний, выгрузка строк в JS стоила ~3 с на запрос
  it("не выгружает строки списаний и пополнений в JS", async () => {
    // Шпион на делегате Prisma не пробрасывает вызов, поэтому отвечаем пустым списком
    const usageRows = vi
      .spyOn(prisma.usage, "findMany")
      .mockResolvedValue([] as never);
    const depositRows = vi
      .spyOn(prisma.deposit, "findMany")
      .mockResolvedValue([] as never);
    await getBalance("org");
    expect(usageRows).not.toHaveBeenCalled();
    expect(depositRows).not.toHaveBeenCalled();
  });

  it("сумма списаний считается по покрывающему индексу", async () => {
    const plan = await prisma.$queryRawUnsafe<{ detail: string }[]>(
      "EXPLAIN QUERY PLAN SELECT SUM(cost) FROM Usage WHERE orgId = 'org'",
    );
    expect(plan.map((row) => row.detail).join("\n")).toMatch(
      /USING COVERING INDEX/,
    );
  });
});
