import { buildApp } from "./app";
import { config } from "./config";
import { withChaos } from "./providers/chaos";
import { createGptunnelProvider } from "./providers/gptunnel";
import { createReserveProvider } from "./providers/reserve";

if (!config.gptunnelApiKey) {
  console.warn(
    "GPTUNNEL_API_KEY не задан: основной провайдер будет отвечать 401, запросы уйдут в резерв",
  );
}

const providers = [
  withChaos(
    createGptunnelProvider({
      baseUrl: config.gptunnelBaseUrl,
      apiKey: config.gptunnelApiKey,
    }),
    {
      firstTokenDelayMs: config.chaos.firstTokenDelayMs,
      midstreamFailRate: config.chaos.midstreamFailRate,
      failAfterChunks: config.chaos.midstreamFailAfterChunks,
    },
  ),
  withChaos(createReserveProvider(), {
    startFailRate: config.chaos.reserveFailRate,
  }),
];

const app = buildApp({ providers, adminToken: config.adminToken });

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
