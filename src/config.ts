import "dotenv/config";

const num = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && process.env[name] !== "" ? value : fallback;
};

export const config = {
  port: num("PORT", 3000),
  gptunnelBaseUrl: process.env.GPTUNNEL_BASE_URL ?? "https://gptunnel.ru/v1",
  gptunnelApiKey: process.env.GPTUNNEL_API_KEY ?? "",
  adminToken: process.env.ADMIN_TOKEN ?? "dev-admin",
  chaos: {
    firstTokenDelayMs: num("CHAOS_FIRST_TOKEN_DELAY_MS", 0),
    midstreamFailRate: num("CHAOS_MIDSTREAM_FAIL_RATE", 0),
    midstreamFailAfterChunks: num("CHAOS_MIDSTREAM_FAIL_AFTER_CHUNKS", 5),
    reserveFailRate: num("CHAOS_RESERVE_FAIL_RATE", 0),
  },
};
