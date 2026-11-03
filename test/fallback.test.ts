import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../src/db";
import type { Provider } from "../src/providers/types";
import { fakeProvider, resetDb, TEST_KEY, testApp } from "./helpers";

// Основной провайдер, который отдаёт куски и рвёт стрим, как gptunnel 21.10
function breakingProvider(chunks: string[]): Provider {
  return {
    name: "primary",
    async stream(_request, _model, { onDelta }) {
      for (const chunk of chunks) onDelta(chunk);
      throw new TypeError("terminated");
    },
  };
}

const body = {
  model: "test-model",
  messages: [{ role: "user", content: "hi" }],
};

async function send(providers: Provider[], stream: boolean) {
  const app = testApp(providers);
  return app.inject({
    method: "POST",
    url: "/v1/chat/completions",
    headers: { authorization: `Bearer ${TEST_KEY}` },
    payload: { ...body, stream },
  });
}

describe("фолбэк на резервный провайдер", () => {
  beforeEach(resetDb);

  it("стрим упал до первого куска: отвечает резерв, списание за резерв", async () => {
    const res = await send(
      [breakingProvider([]), fakeProvider(["[reserve]"], "reserve")],
      true,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"content":"[reserve]"');
    expect(res.body.trim().endsWith("data: [DONE]")).toBe(true);
    const usages = await prisma.usage.findMany();
    expect(usages).toMatchObject([{ provider: "reserve", status: "ok" }]);
  });

  it("стрим оборвался посередине: без склейки с резервом, клиент получает событие ошибки", async () => {
    let reserveCalled = false;
    const reserve: Provider = {
      name: "reserve",
      async stream(_request, _model, { onDelta }) {
        reserveCalled = true;
        onDelta("[reserve]");
        return { promptTokens: 100, completionTokens: 10 };
      },
    };

    const res = await send([breakingProvider(["Hello", " wor"]), reserve], true);

    expect(reserveCalled).toBe(false);
    expect(res.body).toContain('"content":"Hello"');
    expect(res.body).not.toContain("[reserve]");

    const events = res.body
      .split("\n\n")
      .filter((e) => e.startsWith("data: "))
      .map((e) => e.slice(6));
    // Последнее событие — ошибка в формате OpenAI, без [DONE]: клиент видит, что ответ оборван
    expect(events.at(-1)).not.toBe("[DONE]");
    expect(JSON.parse(events.at(-1)!)).toMatchObject({
      error: { type: "upstream_error" },
    });

    const usages = await prisma.usage.findMany();
    expect(usages).toMatchObject([{ status: "error", cost: 0 }]);
  });

  it("обычный ответ: основной упал посередине — отвечает резерв, без куска основного", async () => {
    const res = await send(
      [breakingProvider(["Hello", " wor"]), fakeProvider(["[reserve]"], "reserve")],
      false,
    );

    expect(res.statusCode).toBe(200);
    expect(res.json().choices[0].message.content).toBe("[reserve]");
    const usages = await prisma.usage.findMany();
    expect(usages).toMatchObject([{ provider: "reserve", status: "ok" }]);
  });
});
