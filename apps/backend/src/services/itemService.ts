import { prisma } from "../db.js";
import { issueAccessToken } from "./tokenService.js";
import {
  generateAccounts,
  generateIdentity,
  generateIncome,
  generateTransactions,
} from "../utils/mockDataGenerator.js";
import { generateInvestments, type SecurityRef } from "../utils/investmentGenerator.js";
import { fireWebhook } from "./webhookService.js";

/**
 * Materializes an Item + all its data from a finalized link session.
 */
export async function createItemFromSession(args: {
  applicationId: string;
  institutionId: string;
  clientUserId: string;
  products: string[];
  selectedAccountIds: string[]; // display-ids from session; we regenerate real data for sandbox
  webhookUrl?: string | null;
}): Promise<{ itemId: string; accessToken: string }> {
  const { applicationId, institutionId, clientUserId, products, webhookUrl } = args;
  const { raw: accessToken, hash } = issueAccessToken();

  const item = await prisma.item.create({
    data: {
      applicationId,
      institutionId,
      clientUserId,
      accessTokenHash: hash,
      status: "GOOD",
      products,
      webhookUrl: webhookUrl ?? null,
    },
  });

  // Accounts
  const accounts = generateAccounts({ itemId: item.id, products });
  await prisma.account.createMany({ data: accounts.map((a) => a.data) });

  // Transactions
  for (const a of accounts) {
    if (a.role === "brokerage") continue;
    const txs = generateTransactions({
      itemId: item.id,
      accountId: a.data.id as string,
      accountRole: a.role,
    });
    if (txs.length > 0) await prisma.transaction.createMany({ data: txs });
  }

  // Investments
  const brokerage = accounts.find((a) => a.role === "brokerage");
  if (brokerage) {
    const secs = await prisma.security.findMany();
    const refs: SecurityRef[] = secs.map((s: (typeof secs)[number]) => ({
      id: s.id,
      tickerSymbol: s.tickerSymbol,
      name: s.name,
      closePrice: s.closePrice,
      paysDividend: true,
    }));
    const inv = generateInvestments({
      itemId: item.id,
      accountId: brokerage.data.id as string,
      securities: refs,
    });
    if (inv.holdings.length > 0) await prisma.investmentHolding.createMany({ data: inv.holdings });
    if (inv.transactions.length > 0) await prisma.investmentTransaction.createMany({ data: inv.transactions });
    await prisma.account.update({
      where: { id: brokerage.data.id as string },
      data: { currentBalance: inv.totalValue, availableBalance: inv.totalValue },
    });
  }

  await prisma.identity.create({ data: generateIdentity(item.id) });
  await prisma.incomeVerification.create({ data: generateIncome(item.id) });

  // Fire historical update webhook
  await fireWebhook({
    applicationId,
    itemId: item.id,
    code: "TRANSACTIONS_HISTORICAL_UPDATE",
  });

  return { itemId: item.id, accessToken };
}

export async function deleteItem(itemId: string) {
  // Idempotent: if the row is already gone (concurrent disconnect,
  // cascade from elsewhere, or a frontend retry that landed after
  // the first call already cleaned up), treat as success rather
  // than throwing P2025 to the route handler. The user's intent —
  // "this brokerage should be disconnected" — is satisfied either
  // way; surfacing a 500 just makes the UI flicker.
  await prisma.item.deleteMany({ where: { id: itemId } });
}

export async function updateItemWebhook(itemId: string, webhookUrl: string | null) {
  return prisma.item.update({ where: { id: itemId }, data: { webhookUrl } });
}

export async function setItemStatus(itemId: string, status: "GOOD" | "LOGIN_REQUIRED" | "ERROR") {
  return prisma.item.update({ where: { id: itemId }, data: { status } });
}
