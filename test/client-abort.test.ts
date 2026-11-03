import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getBalance } from "../src/billing/balance";
import { prisma } from "../src/db";
import type { Provider } from "../src/providers/types";
import { resetDb, TEST_KEY, testApp } from "./helpers";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Медленный провайдер: отдаёт заданные куски и «думает» до 2 секунд,
// пока его не остановят через signal. Запоминает, увидел ли он отмену.
function slowProvider(chunks: string[]) {
  const state = { aborted: false };
  const provider: Provider = {
    name: "slow",
    async stream(_request, _model, { onDelta }, signal) {
      for (const chunk of chunks) onDelta(chunk);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 2000);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          state.aborted = true;
          reject(new DOMException("aborted", "AbortError"));
        });
      });
      return { promptTokens: 100, completionTokens: 500 };
    },
  };
  return { provider, state };
}

function spyProvider(name: string) {
  const state = { called: false };
  const provider: Provider = {
    name,
    async stream(_request, _model, { onDelta }) {
      state.called = true;
      onDelta("[reserve]");
      return { promptTokens: 100, completionTokens: 10 };
    },
  };
  return { provider, state };
}

async function waitForUsage() {
  for (let i = 0; i < 50; i++) {
    const usages = await prisma.usage.findMany();
    if (usages.length) return usages;
    await sleep(20);
  }
  return [];
}

// Сценарий 21.10: SDK не дождался ответа и оборвал соединение
describe("клиент оборвал соединение", () => {
  let app: FastifyInstance;

  beforeEach(resetDb);
  afterEach(() => app?.close());

  for (const stream of [true, false]) {
    for (const chunks of [[], ["Hello"]]) {
      if (!stream && chunks.length) continue;
      const name = `${stream ? "стрим" : "обычный ответ"}, ${chunks.length ? "после первого куска" : "до первого куска"}`;

      it(`${name}: генерация останавливается, резерв не вызывается, деньги не списываются`, async () => {
        const slow = slowProvider(chunks);
        const reserve = spyProvider("reserve");
        app = testApp([slow.provider, reserve.provider]);
        const address = await app.listen({ port: 0, host: "127.0.0.1" });

        const controller = new AbortController();
        const res = fetch(`${address}/v1/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${TEST_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "test-model",
            stream,
            messages: [{ role: "user", content: "hi" }],
          }),
          signal: controller.signal,
        });

        if (chunks.length) {
          const reader = (await res).body!.getReader();
          await reader.read();
        } else {
          await sleep(200);
        }
        controller.abort();
        await res.catch(() => {});

        const usages = await waitForUsage();
        expect(slow.state.aborted).toBe(true);
        expect(reserve.state.called).toBe(false);
        expect(usages).toHaveLength(1);
        expect(usages[0]).toMatchObject({ status: "error", cost: 0 });
        expect(await getBalance("org")).toBe(100);
      });
    }
  }
});
