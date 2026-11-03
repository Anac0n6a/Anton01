import { estimateTokens } from "../lib/sse";
import type { Provider } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Резервный провайдер. В песочнице это заглушка: отвечает шаблонным текстом.
export function createReserveProvider(): Provider {
  return {
    name: "reserve",
    async stream(request, upstreamModel, { onDelta }) {
      const text = `[reserve:${upstreamModel}] Это ответ резервного провайдера. В песочнице он отвечает заглушкой.`;
      for (const word of text.split(/(?<= )/)) {
        await sleep(25);
        onDelta(word);
      }
      return {
        promptTokens: estimateTokens(JSON.stringify(request.messages)),
        completionTokens: estimateTokens(text),
      };
    },
  };
}
