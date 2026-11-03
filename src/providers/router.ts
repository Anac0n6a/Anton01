import type { FastifyBaseLogger } from "fastify";

import type { ChatRequest, Provider, Usage } from "./types";

export interface RoutedResult {
  usage: Usage;
  provider: string;
}

// Идём по провайдерам по порядку: если основной упал — пробуем резервный.
// signal срабатывает, когда клиент ушёл: тогда генерацию прекращаем и в резерв не идём.
export async function streamWithFallback(
  providers: Provider[],
  request: ChatRequest,
  upstreamModel: string,
  onDelta: (text: string) => void,
  log: FastifyBaseLogger,
  signal?: AbortSignal,
): Promise<RoutedResult> {
  let lastError: unknown;
  for (const provider of providers) {
    signal?.throwIfAborted();
    try {
      const usage = await provider.stream(
        request,
        upstreamModel,
        { onDelta },
        signal,
      );
      return { usage, provider: provider.name };
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
      log.warn(
        { provider: provider.name, err: String(err) },
        "provider failed, trying next",
      );
    }
  }
  throw lastError;
}
