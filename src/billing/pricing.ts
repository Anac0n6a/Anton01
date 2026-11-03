import type { Model } from "@prisma/client";

import type { Usage } from "../providers/types";

// Договорные цены, перенесены из первой версии гейтвея.
// TODO: убрать, когда весь прайс переедет в таблицу Model
const LEGACY_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.18, output: 0.72 },
  "claude-sonnet": { input: 1.1, output: 5.4 },
};

export function priceFor(
  model: Pick<Model, "id" | "priceInputPer1k" | "priceOutputPer1k">,
) {
  return (
    LEGACY_PRICES[model.id] ?? {
      input: model.priceInputPer1k,
      output: model.priceOutputPer1k,
    }
  );
}

// Стоимость запроса в рублях
export function calcCost(
  model: Pick<Model, "id" | "priceInputPer1k" | "priceOutputPer1k">,
  usage: Usage,
) {
  const price = priceFor(model);
  const cost =
    (usage.promptTokens * price.input + usage.completionTokens * price.output) /
    1000;
  return Math.round(cost * 10_000) / 10_000;
}
