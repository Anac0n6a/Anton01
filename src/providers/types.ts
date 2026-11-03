export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
}

export interface Provider {
  name: string;
  // Стримит ответ через onDelta и возвращает фактический usage
  stream(
    request: ChatRequest,
    upstreamModel: string,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ): Promise<Usage>;
}

export class ProviderError extends Error {
  constructor(
    public provider: string,
    public status: number,
    message: string,
  ) {
    super(`${provider}: ${status} ${message}`);
  }
}
