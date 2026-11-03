import { prisma } from "../db";
import type { Usage } from "../providers/types";

export interface ChargeInput {
  requestId: string;
  orgId: string;
  apiKeyId: string;
  model: string;
  provider: string;
  usage: Usage;
  cost: number;
  status: "ok" | "error";
}

export async function charge(input: ChargeInput) {
  await prisma.usage.create({
    data: {
      requestId: input.requestId,
      orgId: input.orgId,
      apiKeyId: input.apiKeyId,
      model: input.model,
      provider: input.provider,
      promptTokens: input.usage.promptTokens,
      completionTokens: input.usage.completionTokens,
      cost: input.cost,
      status: input.status,
    },
  });
}
