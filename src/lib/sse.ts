export const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache",
  connection: "keep-alive",
};

export const SSE_DONE = "data: [DONE]\n\n";

export interface OpenAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost: number;
}

export function sseChunk(
  id: string,
  model: string,
  content: string | null,
  finishReason: string | null,
  usage?: OpenAiUsage,
) {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: content === null ? {} : { content },
        finish_reason: finishReason,
      },
    ],
    ...(usage ? { usage } : {}),
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

// Грубая оценка: ~4 символа на токен
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}
