import type { FastifyBaseLogger } from "fastify";

import type { ChatRequest, Provider, Usage } from "./types";

export interface RoutedResult {
  usage: Usage;
  provider: string;
}

// Идём по провайдерам по порядку: если основной упал — пробуем резервный
export async function streamWithFallback(
  providers: Provider[],
  request: ChatRequest,
  upstreamModel: string,
  onDelta: (text: string) => void,
  log: FastifyBaseLogger,
): Promise<RoutedResult> {
  let lastError: unknown;
  for (const provider of providers) {
    try {
      const usage = await provider.stream(request, upstreamModel, { onDelta });
      return { usage, provider: provider.name };
    } catch (err) {
      lastError = err;
      log.warn(
        { provider: provider.name, err: String(err) },
        "provider failed, trying next",
      );
    }
  }
  throw lastError;
}
