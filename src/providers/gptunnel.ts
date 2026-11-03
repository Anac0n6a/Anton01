import { estimateTokens } from "../lib/sse";
import { type Provider, ProviderError, type Usage } from "./types";

interface Options {
  baseUrl: string;
  apiKey: string;
}

// Основной провайдер: OpenAI-совместимый API GPTunneL
export function createGptunnelProvider({ baseUrl, apiKey }: Options): Provider {
  return {
    name: "gptunnel",
    async stream(request, upstreamModel, { onDelta }, signal) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          ...request,
          model: upstreamModel,
          stream: true,
        }),
        signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new ProviderError("gptunnel", res.status, text.slice(0, 300));
      }

      let usage: Usage | undefined;
      let completion = "";
      let buffer = "";
      const decoder = new TextDecoder();

      for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(part, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;

          let json: any;
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }
          if (json.error) {
            throw new ProviderError(
              "gptunnel",
              502,
              JSON.stringify(json.error),
            );
          }

          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            completion += delta;
            onDelta(delta);
          }
          if (json.usage) {
            usage = {
              promptTokens: json.usage.prompt_tokens ?? 0,
              completionTokens: json.usage.completion_tokens ?? 0,
            };
          }
        }
      }

      return (
        usage ?? {
          promptTokens: estimateTokens(JSON.stringify(request.messages)),
          completionTokens: estimateTokens(completion),
        }
      );
    },
  };
}
