import { prisma } from "../db.js";

export async function getIncomeSummary(itemId: string) {
  const i = await prisma.incomeVerification.findUnique({ where: { itemId } });
  if (!i) return null;
  return {
    item_id: itemId,
    employer_name: i.employerName,
    pay_frequency: i.payFrequency,
    projected_yearly_income: i.projectedYearlyIncome,
    ytd_gross_income: i.ytdGrossIncome,
  };
}

export async function getIncomePaystubs(itemId: string) {
  const i = await prisma.incomeVerification.findUnique({ where: { itemId } });
  if (!i) return null;
  return {
    item_id: itemId,
    employer_name: i.employerName,
    pay_stubs: i.payStubs,
  };
}
