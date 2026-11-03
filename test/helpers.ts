import { buildApp } from "../src/app";
import { prisma } from "../src/db";
import type { Provider } from "../src/providers/types";

export const TEST_KEY = "sk-test-key";

// Провайдер-заглушка: отдаёт заданные куски текста
export function fakeProvider(chunks: string[], name = "fake"): Provider {
  return {
    name,
    async stream(_request, _model, { onDelta }) {
      for (const chunk of chunks) onDelta(chunk);
      return { promptTokens: 100, completionTokens: chunks.length * 10 };
    },
  };
}

export async function resetDb() {
  await prisma.usage.deleteMany();
  await prisma.deposit.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.model.deleteMany();

  await prisma.model.create({
    data: {
      id: "test-model",
      title: "Test",
      upstreamModel: "test-upstream",
      priceInputPer1k: 1,
      priceOutputPer1k: 2,
      maxOutputTokens: 1000,
    },
  });
  await prisma.organization.create({
    data: { id: "org", name: "Org", creditLimit: 0 },
  });
  await prisma.apiKey.create({
    data: { id: "key", orgId: "org", name: "test", key: TEST_KEY },
  });
  await prisma.deposit.create({ data: { orgId: "org", amount: 100 } });
}

export function testApp(providers: Provider[]) {
  return buildApp({ providers, adminToken: "admin", logger: false });
}
