import type { FastifyInstance } from "fastify";

import { isAdmin } from "../auth";
import { getBalance } from "../billing/balance";
import { prisma } from "../db";
import { apiError } from "../lib/errors";

// Внутренние ручки для кабинета и поддержки
export async function adminRoutes(
  app: FastifyInstance,
  { adminToken }: { adminToken: string },
) {
  app.addHook("onRequest", async (request, reply) => {
    if (!isAdmin(request, adminToken)) {
      return reply
        .code(401)
        .send(apiError("Admin token required", "unauthorized_request_error"));
    }
  });

  app.get("/admin/orgs", async () => {
    const orgs = await prisma.organization.findMany({
      orderBy: { name: "asc" },
    });
    return Promise.all(
      orgs.map(async (org) => ({
        id: org.id,
        name: org.name,
        creditLimit: org.creditLimit,
        balance: await getBalance(org.id),
      })),
    );
  });

  app.get<{ Params: { orgId: string } }>(
    "/admin/orgs/:orgId/keys",
    async (request) => {
      const keys = await prisma.apiKey.findMany({
        where: { orgId: request.params.orgId },
        orderBy: { createdAt: "asc" },
      });
      const spent = await prisma.usage.groupBy({
        by: ["apiKeyId"],
        where: { orgId: request.params.orgId },
        _sum: { cost: true },
        _count: true,
      });
      return keys.map((key) => {
        const row = spent.find((s) => s.apiKeyId === key.id);
        return {
          id: key.id,
          name: key.name,
          createdAt: key.createdAt,
          revokedAt: key.revokedAt,
          requests: row?._count ?? 0,
          spent: row?._sum.cost ?? 0,
        };
      });
    },
  );

  app.get<{ Params: { orgId: string }; Querystring: { limit?: string } }>(
    "/admin/orgs/:orgId/usage",
    async (request) => {
      return prisma.usage.findMany({
        where: { orgId: request.params.orgId },
        orderBy: { id: "desc" },
        take: Math.min(Number(request.query.limit ?? 50), 500),
      });
    },
  );

  app.post<{ Params: { orgId: string }; Body: { amount: number } }>(
    "/admin/orgs/:orgId/deposits",
    async (request, reply) => {
      const amount = Number(request.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return reply
          .code(400)
          .send(apiError("amount must be positive", "invalid_request_error"));
      }
      return prisma.deposit.create({
        data: { orgId: request.params.orgId, amount },
      });
    },
  );
}
