import { prisma } from "../db";

// Баланс = все пополнения минус все списания
export async function getBalance(orgId: string): Promise<number> {
  const deposits = await prisma.deposit.findMany({ where: { orgId } });
  const usages = await prisma.usage.findMany({ where: { orgId } });

  const income = deposits.reduce((sum, d) => sum + d.amount, 0);
  const spent = usages.reduce((sum, u) => sum + u.cost, 0);
  return income - spent;
}
