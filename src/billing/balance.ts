import { prisma } from "../db";

// Баланс = все пополнения минус все списания. Суммирует база по индексам из
// schema.prisma: строки не выгружаются, у крупных клиентов их сотни тысяч.
export async function getBalance(orgId: string): Promise<number> {
  const [deposits, usages] = await Promise.all([
    prisma.deposit.aggregate({ where: { orgId }, _sum: { amount: true } }),
    prisma.usage.aggregate({ where: { orgId }, _sum: { cost: true } }),
  ]);
  return (deposits._sum.amount ?? 0) - (usages._sum.cost ?? 0);
}
