import { randomUUID } from "node:crypto";

import type { Model } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { authenticate } from "../auth";
import { getBalance } from "../billing/balance";
import { charge } from "../billing/charge";
import { calcCost } from "../billing/pricing";
import { prisma } from "../db";
import { apiError } from "../lib/errors";
import { estimateTokens, SSE_DONE, SSE_HEADERS, sseChunk } from "../lib/sse";
import { streamWithFallback } from "../providers/router";
import type { ChatRequest, Provider, Usage } from "../providers/types";

interface Options {
  providers: Provider[];
}

interface Billing {
  requestId: string;
  orgId: string;
  apiKeyId: string;
  model: Model;
}

// Срабатывает, если клиент закрыл соединение раньше, чем мы закончили ответ
// (например, SDK оборвал запрос по таймауту): генерацию останавливаем и не списываем.
function clientGone(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.on("close", () => {
    if (!reply.raw.writableEnded) controller.abort();
  });
  return controller.signal;
}

export async function chatRoutes(app: FastifyInstance, { providers }: Options) {
  app.post("/v1/chat/completions", async (request, reply) => {
    const signal = clientGone(reply);
    const apiKey = await authenticate(request);
    if (!apiKey) {
      return reply
        .code(401)
        .send(apiError("Invalid API key", "unauthorized_request_error"));
    }

    const body = request.body as ChatRequest;
    if (!body?.model || !Array.isArray(body.messages)) {
      return reply
        .code(400)
        .send(
          apiError("model and messages are required", "invalid_request_error"),
        );
    }

    const model = await prisma.model.findUnique({ where: { id: body.model } });
    if (!model || !model.active) {
      return reply
        .code(404)
        .send(
          apiError(
            `The model '${body.model}' does not exist`,
            "invalid_request_error",
          ),
        );
    }

    const startedAt = Date.now();
    const balance = await getBalance(apiKey.orgId);
    request.log.info(
      {
        orgId: apiKey.orgId,
        keyId: apiKey.id,
        model: model.id,
        stream: !!body.stream,
        balanceMs: Date.now() - startedAt,
      },
      "balance checked",
    );
    if (balance + apiKey.org.creditLimit <= 0) {
      return reply
        .code(402)
        .send(apiError("Insufficient balance", "insufficient_balance"));
    }

    const billing: Billing = {
      requestId: `chatcmpl-${randomUUID()}`,
      orgId: apiKey.orgId,
      apiKeyId: apiKey.id,
      model,
    };

    if (body.stream) {
      return streamCompletion(request, reply, providers, body, billing, signal);
    }
    return completion(request, reply, providers, body, billing, signal);
  });
}

async function streamCompletion(
  request: FastifyRequest,
  reply: FastifyReply,
  providers: Provider[],
  body: ChatRequest,
  billing: Billing,
  signal: AbortSignal,
) {
  reply.hijack();
  const res = reply.raw;
  res.on("error", () => {});

  let started = false;
  const onDelta = (text: string) => {
    if (!started) {
      res.writeHead(200, SSE_HEADERS);
      started = true;
    }
    res.write(sseChunk(billing.requestId, billing.model.id, text, null));
  };

  try {
    const { usage, provider } = await streamWithFallback(
      providers,
      body,
      billing.model.upstreamModel,
      onDelta,
      request.log,
      signal,
    );
    const cost = await chargeUsage(request, billing, provider, usage, "ok");

    if (!started) res.writeHead(200, SSE_HEADERS);
    res.write(
      sseChunk(
        billing.requestId,
        billing.model.id,
        null,
        "stop",
        toOpenAiUsage(usage, cost),
      ),
    );
    res.end(SSE_DONE);
  } catch (err) {
    logFailure(request, billing, err, signal);
    await chargeFailed(request, billing, body);
    if (signal.aborted) return;

    if (!started) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(
        JSON.stringify(apiError("Upstream provider error", "upstream_error")),
      );
    } else {
      res.end();
    }
  }
}

async function completion(
  request: FastifyRequest,
  reply: FastifyReply,
  providers: Provider[],
  body: ChatRequest,
  billing: Billing,
  signal: AbortSignal,
) {
  let content = "";
  try {
    const { usage, provider } = await streamWithFallback(
      providers,
      body,
      billing.model.upstreamModel,
      (text) => (content += text),
      request.log,
      signal,
    );
    const cost = await chargeUsage(request, billing, provider, usage, "ok");
    return reply.send({
      id: billing.requestId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: billing.model.id,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: toOpenAiUsage(usage, cost),
    });
  } catch (err) {
    logFailure(request, billing, err, signal);
    await chargeFailed(request, billing, body);
    return reply
      .code(502)
      .send(apiError("Upstream provider error", "upstream_error"));
  }
}

function logFailure(
  request: FastifyRequest,
  billing: Billing,
  err: unknown,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    request.log.warn({ requestId: billing.requestId }, "client disconnected");
  } else {
    request.log.error(
      { requestId: billing.requestId, err: String(err) },
      "completion failed",
    );
  }
}

async function chargeUsage(
  request: FastifyRequest,
  billing: Billing,
  provider: string,
  usage: Usage,
  status: "ok" | "error",
) {
  const cost = status === "ok" ? calcCost(billing.model, usage) : 0;
  await charge({
    requestId: billing.requestId,
    orgId: billing.orgId,
    apiKeyId: billing.apiKeyId,
    model: billing.model.id,
    provider,
    usage,
    cost,
    status,
  });
  request.log.info(
    { requestId: billing.requestId, provider, status, cost, ...usage },
    "charged",
  );
  return cost;
}

// Неудачный запрос бесплатен: клиент не получил ответа целиком.
// Строку со статусом error и нулевой суммой пишем, чтобы запрос был виден
// в кабинете и в отчётах.
async function chargeFailed(
  request: FastifyRequest,
  billing: Billing,
  body: ChatRequest,
) {
  const usage: Usage = {
    promptTokens: estimateTokens(JSON.stringify(body.messages)),
    completionTokens: 0,
  };
  await chargeUsage(request, billing, "none", usage, "error");
}

function toOpenAiUsage(usage: Usage, cost: number) {
  return {
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.promptTokens + usage.completionTokens,
    total_cost: cost,
  };
}
