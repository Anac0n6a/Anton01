import { beforeEach, describe, expect, it } from "vitest";

import { fakeProvider, resetDb, testApp } from "./helpers";

describe("GET /v1/models", () => {
  beforeEach(resetDb);

  it("отдаёт каталог с ценами", async () => {
    const app = testApp([fakeProvider([])]);
    const res = await app.inject({ method: "GET", url: "/v1/models" });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([
      expect.objectContaining({
        id: "test-model",
        cost_context: "1.0000",
        cost_completion: "2.0000",
      }),
    ]);
  });
});
