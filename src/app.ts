import { randomUUID } from "node:crypto";

import Fastify, { type FastifyServerOptions } from "fastify";

import type { Provider } from "./providers/types";
import { adminRoutes } from "./routes/admin";
import { chatRoutes } from "./routes/chat";
import { modelRoutes } from "./routes/models";

interface AppOptions {
  providers: Provider[];
  adminToken: string;
  logger?: FastifyServerOptions["logger"];
}

export function buildApp({ providers, adminToken, logger = true }: AppOptions) {
  const app = Fastify({
    logger,
    genReqId: (req) =>
      (req.headers["x-request-id"] as string) ??
      `req-${randomUUID().slice(0, 8)}`,
  });

  app.get("/health", async () => ({ ok: true }));
  app.register(modelRoutes);
  app.register(chatRoutes, { providers });
  app.register(adminRoutes, { adminToken });

  return app;
}
