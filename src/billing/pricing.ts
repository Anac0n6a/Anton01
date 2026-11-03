import type { Model } from "@prisma/client";

import type { Usage } from "../providers/types";

// Стоимость запроса в рублях по публичному каталогу (таблица Model, она же /v1/models)
export function calcCost(
  model: Pick<Model, "priceInputPer1k" | "priceOutputPer1k">,
  usage: Usage,
) {
  const cost =
    (usage.promptTokens * model.priceInputPer1k +
      usage.completionTokens * model.priceOutputPer1k) /
    1000;
  return Math.round(cost * 10_000) / 10_000;
}
