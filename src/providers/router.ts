import type { FastifyBaseLogger } from "fastify";

import type { ChatRequest, Provider, Usage } from "./types";

export interface RoutedResult {
  usage: Usage;
  provider: string;
}

export interface RouteOptions {
  // Срабатывает, когда клиент ушёл: генерацию прекращаем и в резерв не идём
  signal?: AbortSignal;
  // Вызывается перед переходом к следующему провайдеру. false — переходить нельзя:
  // часть ответа упавшего провайдера уже у клиента, и ответ резерва склеился бы с ней
  beforeFallback?: () => boolean;
}

// Идём по провайдерам по порядку: если основной упал — пробуем резервный
export async function streamWithFallback(
  providers: Provider[],
  request: ChatRequest,
  upstreamModel: string,
  onDelta: (text: string) => void,
  log: FastifyBaseLogger,
  { signal, beforeFallback }: RouteOptions = {},
): Promise<RoutedResult> {
  let lastError: unknown;
  for (const [i, provider] of providers.entries()) {
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
      const hasNext = i < providers.length - 1;
      if (hasNext && beforeFallback && !beforeFallback()) {
        log.warn(
          { provider: provider.name, err: String(err) },
          "provider failed after output was sent, no fallback",
        );
        throw err;
      }
      log.warn(
        { provider: provider.name, err: String(err) },
        "provider failed, trying next",
      );
    }
  }
  throw lastError;
}
