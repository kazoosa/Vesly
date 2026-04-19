/**
 * Seeds the logged-in developer with a realistic mock portfolio across
 * 4 brokerages (Fidelity, Schwab, Robinhood, Chase). Idempotent — skips
 * if the developer already has any Items.
 *
 * Used both at registration and via a "Load demo data" button for users
 * who want to explore before connecting real accounts through SnapTrade.
 */
import { prisma } from "../db.js";
import { hashSecret, randomToken, sha256Hex } from "../utils/crypto.js";
import {
  generateAccounts,
  generateIdentity,
  generateIncome,
  generateTransactions,
} from "../utils/mockDataGenerator.js";
import { generateInvestments, type SecurityRef } from "../utils/investmentGenerator.js";
import { nanoid } from "nanoid";

export async function seedDemoPortfolioForDeveloper(
  developerId: string,
  developerEmail: string,
): Promise<{ created: boolean; itemCount: number }> {
  // Resolve (or create) the developer's implicit application
  let app = await prisma.application.findFirst({ where: { developerId } });
  if (!app) {
    app = await prisma.application.create({
      data: {
        developerId,
        name: `${developerEmail}'s Portfolio`,
        clientId: `cli_${nanoid(24)}`,
        clientSecretHash: await hashSecret(nanoid(40)),
        redirectUris: [],
        allowedProducts: ["transactions", "auth", "balance", "identity", "investments", "income"],
        environment: "sandbox",
      },
    });
  }

  // Idempotent — bail if items already exist
  const existingCount = await prisma.item.count({ where: { applicationId: app.id } });
  if (existingCount > 0) return { created: false, itemCount: existingCount };

  const securities = await prisma.security.findMany();
  const refs: SecurityRef[] = securities.map((s) => ({
    id: s.id,
    tickerSymbol: s.tickerSymbol,
    name: s.name,
    closePrice: s.closePrice,
    paysDividend: true,
  }));

  const brokerages: Array<{ institutionId: string; products: string[] }> = [
    { institutionId: "ins_10", products: ["investments", "balance", "identity"] }, // Fidelity
    { institutionId: "ins_9", products: ["investments", "balance", "identity"] }, // Schwab
    { institutionId: "ins_12", products: ["investments", "balance", "identity"] }, // Robinhood
    { institutionId: "ins_1", products: ["transactions", "auth", "balance", "identity"] }, // Chase
  ];

  for (const b of brokerages) {
    await seedOneItem({
      applicationId: app.id,
      institutionId: b.institutionId,
      clientUserId: developerId,
      securities: refs,
      products: b.products,
    });
  }

  const itemCount = await prisma.item.count({ where: { applicationId: app.id } });
  return { created: true, itemCount };
}

async function seedOneItem(opts: {
  applicationId: string;
  institutionId: string;
  clientUserId: string;
  securities: SecurityRef[];
  products: string[];
}) {
  const { applicationId, institutionId, clientUserId, securities, products } = opts;

  const rawAccessToken = `access-sandbox-${randomToken(24)}`;
  const accessTokenHash = sha256Hex(rawAccessToken);

  const item = await prisma.item.create({
    data: {
      applicationId,
      institutionId,
      clientUserId,
      accessTokenHash,
      status: "GOOD",
      products,
    },
  });

  const accounts = generateAccounts({ itemId: item.id, products });
  await prisma.account.createMany({ data: accounts.map((a) => a.data) });

  // Transactions for depository/credit accounts
  for (const acc of accounts) {
    if (acc.role === "brokerage") continue;
    const txs = generateTransactions({
      itemId: item.id,
      accountId: acc.data.id as string,
      accountRole: acc.role,
    });
    if (txs.length > 0) {
      await prisma.transaction.createMany({ data: txs });
    }
  }

  // Investments for brokerage
  const brokerage = accounts.find((a) => a.role === "brokerage");
  if (brokerage) {
    const inv = generateInvestments({
      itemId: item.id,
      accountId: brokerage.data.id as string,
      securities,
    });
    if (inv.holdings.length > 0) {
      await prisma.investmentHolding.createMany({ data: inv.holdings });
    }
    if (inv.transactions.length > 0) {
      await prisma.investmentTransaction.createMany({ data: inv.transactions });
    }
    await prisma.account.update({
      where: { id: brokerage.data.id as string },
      data: { currentBalance: inv.totalValue, availableBalance: inv.totalValue },
    });
  }

  await prisma.identity.create({ data: generateIdentity(item.id) });
  await prisma.incomeVerification.create({ data: generateIncome(item.id) });

  return item.id;
}
