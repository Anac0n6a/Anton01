import { beforeEach, describe, expect, it } from "vitest";

import { getBalance } from "../src/billing/balance";
import { prisma } from "../src/db";
import type { Provider } from "../src/providers/types";
import { resetDb, TEST_KEY, testApp } from "./helpers";

// Провайдер, который отдаёт несколько кусков и падает, как оборванный стрим 21.10
function failingProvider(chunks: string[], name = "failing"): Provider {
  return {
    name,
    async stream(_request, _model, { onDelta }) {
      for (const chunk of chunks) onDelta(chunk);
      throw new Error(`${name}: 429 rate limit exceeded`);
    },
  };
}

const body = {
  model: "test-model",
  messages: [{ role: "user", content: "hi" }],
};

describe("списание, когда все провайдеры упали", () => {
  beforeEach(resetDb);

  for (const stream of [false, true]) {
    for (const chunks of [[], ["Hello", " wor"]]) {
      const name = `${stream ? "стрим" : "обычный ответ"}, ${chunks.length ? "оборван посередине" : "ничего не отдано"}`;

      it(`${name}: деньги не списываются, запрос виден со статусом error`, async () => {
        const app = testApp([failingProvider(chunks), failingProvider([], "reserve")]);
        const res = await app.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: { authorization: `Bearer ${TEST_KEY}` },
          // max_tokens не должен влиять на сумму
          payload: { ...body, stream, max_tokens: 4096 },
        });

        if (!stream || chunks.length === 0) expect(res.statusCode).toBe(502);

        const usages = await prisma.usage.findMany();
        expect(usages).toHaveLength(1);
        expect(usages[0]).toMatchObject({ status: "error", cost: 0 });
        expect(await getBalance("org")).toBe(100);
      });
    }
  }
});
