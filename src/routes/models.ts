import type { FastifyInstance } from "fastify";

import { prisma } from "../db";

// Публичный каталог моделей с ценами. По нему клиенты считают свои расходы.
export async function modelRoutes(app: FastifyInstance) {
  app.get("/v1/models", async () => {
    const models = await prisma.model.findMany({
      where: { active: true },
      orderBy: { id: "asc" },
    });
    return {
      object: "list",
      data: models.map((m) => ({
        id: m.id,
        object: "model",
        title: m.title,
        max_output_tokens: m.maxOutputTokens,
        // ₽ за 1000 токенов
        cost_context: m.priceInputPer1k.toFixed(4),
        cost_completion: m.priceOutputPer1k.toFixed(4),
      })),
    };
  });
}
