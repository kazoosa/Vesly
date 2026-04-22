/**
 * Seeds the logged-in developer with a realistic mock portfolio across
 * 4 brokerages (Fidelity, Schwab, Robinhood, Chase). Idempotent — skips
 * if the developer already has any Items.
 *
 * Self-sufficient: upserts the Institution and Security tables first so
 * it works even on a fresh database where the general `prisma seed`
 * script was never run. That was the production bug — the demo
 * developer existed but no institutions or securities did, so item
 * creation blew up on a foreign-key error and nothing got seeded.
 *
 * Used both at registration and by the `/demo` auto-login flow.
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
import { INSTITUTIONS } from "../constants/institutions.js";
import { SECURITIES } from "../constants/securities.js";

/**
 * Idempotent upsert of every reference row the demo seed needs. Safe to
 * call on every /demo hit; the per-item guard further below keeps the
 * expensive work from running twice.
 */
async function ensureReferenceData(): Promise<SecurityRef[]> {
  const t0 = Date.now();
  // Institutions
  for (const i of INSTITUTIONS) {
    await prisma.institution.upsert({
      where: { id: i.id },
      update: {
        name: i.name,
        primaryColor: i.primaryColor,
        supportedProducts: i.supportedProducts,
        routingNumbers: i.routingNumbers,
      },
      create: { ...i },
    });
  }
  console.log(`[demoSeed] upserted ${INSTITUTIONS.length} institutions in ${Date.now() - t0}ms`);

  // Securities
  const t1 = Date.now();
  const now = new Date();
  const refs: SecurityRef[] = [];
  for (const s of SECURITIES) {
    const row = await prisma.security.upsert({
      where: { tickerSymbol: s.tickerSymbol },
      update: {
        name: s.name,
        type: s.type,
        closePrice: s.closePrice,
        closePriceAsOf: now,
        exchange: s.exchange,
      },
      create: {
        tickerSymbol: s.tickerSymbol,
        name: s.name,
        type: s.type,
        closePrice: s.closePrice,
        closePriceAsOf: now,
        exchange: s.exchange,
        isoCurrencyCode: "USD",
      },
    });
    refs.push({
      id: row.id,
      tickerSymbol: row.tickerSymbol,
      name: row.name,
      closePrice: row.closePrice,
      paysDividend: Boolean(s.paysDividend),
    });
  }
  console.log(`[demoSeed] upserted ${SECURITIES.length} securities in ${Date.now() - t1}ms`);
  return refs;
}

export async function seedDemoPortfolioForDeveloper(
  developerId: string,
  developerEmail: string,
): Promise<{ created: boolean; itemCount: number }> {
  const tStart = Date.now();
  console.log(`[demoSeed] start developer=${developerEmail}`);

  // 0) Make sure institutions + securities exist. Cheap upsert — no-op
  //    on the second call because every row already matches.
  const refs = await ensureReferenceData();

  // 1) Resolve (or create) the developer's implicit application
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

  // 2) Idempotent — bail if we already have a healthy seed. "Healthy"
  //    means at least one Item with at least one InvestmentHolding, so we
  //    don't early-return on a broken half-seeded state (the exact
  //    scenario the deployed demo was stuck in).
  const existingItems = await prisma.item.findMany({
    where: { applicationId: app.id },
    select: { id: true },
  });
  if (existingItems.length > 0) {
    const holdingsCount = await prisma.investmentHolding.count({
      where: { account: { itemId: { in: existingItems.map((i) => i.id) } } },
    });
    if (holdingsCount > 0) {
      console.log(
        `[demoSeed] healthy — items=${existingItems.length}, holdings=${holdingsCount} — skipping (${Date.now() - tStart}ms)`,
      );
      return { created: false, itemCount: existingItems.length };
    }
    // Partial / broken seed — nuke and start over.
    console.log(
      `[demoSeed] wiping ${existingItems.length} empty items (holdings=${holdingsCount}) for ${developerEmail}`,
    );
    await prisma.item.deleteMany({
      where: { id: { in: existingItems.map((i) => i.id) } },
    });
  }

  // 3) Create 4 mock brokerages worth of holdings, transactions, dividends
  const brokerages: Array<{ institutionId: string; products: string[] }> = [
    { institutionId: "ins_10", products: ["investments", "balance", "identity"] }, // Fidelity
    { institutionId: "ins_9",  products: ["investments", "balance", "identity"] }, // Schwab
    { institutionId: "ins_12", products: ["investments", "balance", "identity"] }, // Robinhood
    { institutionId: "ins_1",  products: ["transactions", "auth", "balance", "identity"] }, // Chase
  ];

  for (const b of brokerages) {
    const tItem = Date.now();
    await seedOneItem({
      applicationId: app.id,
      institutionId: b.institutionId,
      clientUserId: developerId,
      securities: refs,
      products: b.products,
    });
    console.log(`[demoSeed] item ${b.institutionId} created in ${Date.now() - tItem}ms`);
  }

  const itemCount = await prisma.item.count({ where: { applicationId: app.id } });
  console.log(
    `[demoSeed] done created=true items=${itemCount} total=${Date.now() - tStart}ms`,
  );
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
