import { type Provider, ProviderError } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ChaosOptions {
  // Задержка перед стартом запроса к провайдеру, мс
  firstTokenDelayMs?: number;
  // Доля запросов, которые сразу получают 429
  startFailRate?: number;
  // Доля стримов, которые рвутся после failAfterChunks чанков
  midstreamFailRate?: number;
  failAfterChunks?: number;
}

// Обёртка для воспроизведения деградаций провайдера в песочнице
export function withChaos(provider: Provider, options: ChaosOptions): Provider {
  const {
    firstTokenDelayMs = 0,
    startFailRate = 0,
    midstreamFailRate = 0,
    failAfterChunks = 5,
  } = options;
  if (!firstTokenDelayMs && !startFailRate && !midstreamFailRate)
    return provider;

  return {
    name: provider.name,
    async stream(request, upstreamModel, handlers, signal) {
      if (firstTokenDelayMs) await sleep(firstTokenDelayMs);
      if (Math.random() < startFailRate) {
        throw new ProviderError(
          provider.name,
          429,
          "rate limit exceeded (chaos)",
        );
      }

      const willFail = Math.random() < midstreamFailRate;
      let chunks = 0;
      return provider.stream(
        request,
        upstreamModel,
        {
          onDelta: (text) => {
            chunks += 1;
            if (willFail && chunks > failAfterChunks) {
              throw new ProviderError(
                provider.name,
                502,
                "upstream stream reset (chaos)",
              );
            }
            handlers.onDelta(text);
          },
        },
        signal,
      );
    },
  };
}
