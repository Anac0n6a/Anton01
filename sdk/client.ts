// Официальный JS-клиент API (в npm публикуется как tunnel-sdk-js).
// Им пользуется большинство клиентов, включая Альфа-Ритейл.

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  // Сколько ждать ответа сервера, мс
  timeoutMs?: number;
  maxRetries?: number;
}

export interface ChatBody {
  model: string;
  messages: { role: string; content: string }[];
  max_tokens?: number;
  temperature?: number;
}

const isAbort = (err: unknown) =>
  err instanceof Error && err.name === "AbortError";

export class GatewayClient {
  constructor(private options: ClientOptions) {}

  async *streamChat(body: ChatBody): AsyncGenerator<string> {
    const {
      apiKey,
      baseUrl = "http://localhost:3000",
      timeoutMs = 10_000,
      maxRetries = 2,
    } = this.options;

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "user-agent": "tunnel-sdk-js/1.4.2",
          },
          body: JSON.stringify({ ...body, stream: true }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.status >= 500 && attempt < maxRetries) continue;
        if (!res.ok || !res.body)
          throw new Error(`API error ${res.status}: ${await res.text()}`);

        yield* readSse(res.body);
        return;
      } catch (err) {
        clearTimeout(timer);
        // Таймаут — сервер не ответил, пробуем ещё раз
        if (isAbort(err) && attempt < maxRetries) continue;
        throw err;
      }
    }
  }
}

async function* readSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const part of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(part, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      const json = JSON.parse(data);
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
