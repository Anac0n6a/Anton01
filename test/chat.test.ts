import { beforeEach, describe, expect, it } from "vitest";

import { getBalance } from "../src/billing/balance";
import { prisma } from "../src/db";
import { fakeProvider, resetDb, TEST_KEY, testApp } from "./helpers";

const body = {
  model: "test-model",
  messages: [{ role: "user", content: "hi" }],
};

describe("POST /v1/chat/completions", () => {
  beforeEach(resetDb);

  it("без ключа отвечает 401", async () => {
    const app = testApp([fakeProvider(["a"])]);
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it("отдаёт обычный ответ и списывает деньги", async () => {
    const app = testApp([fakeProvider(["Hello", " world"])]);
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${TEST_KEY}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().choices[0].message.content).toBe("Hello world");
    // 100 входных по 1 ₽ + 20 выходных по 2 ₽ за 1000 токенов
    expect(res.json().usage.total_cost).toBe(0.14);
    expect(await getBalance("org")).toBeCloseTo(99.86);
  });

  it("стримит ответ в формате SSE", async () => {
    const app = testApp([fakeProvider(["Hello", " world"])]);
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${TEST_KEY}` },
      payload: { ...body, stream: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain('"content":"Hello"');
    expect(res.body.trim().endsWith("data: [DONE]")).toBe(true);
    expect(await prisma.usage.count()).toBe(1);
  });

  it("без денег отвечает 402", async () => {
    await prisma.deposit.deleteMany();
    const app = testApp([fakeProvider(["a"])]);
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${TEST_KEY}` },
      payload: body,
    });
    expect(res.statusCode).toBe(402);
  });
});
