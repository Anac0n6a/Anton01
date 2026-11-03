import type { FastifyRequest } from "fastify";

import { prisma } from "./db";

export async function authenticate(request: FastifyRequest) {
  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (!token) return null;

  return prisma.apiKey.findFirst({
    where: { key: token, revokedAt: null },
    include: { org: true },
  });
}

export function isAdmin(request: FastifyRequest, adminToken: string) {
  return request.headers["x-admin-token"] === adminToken;
}
