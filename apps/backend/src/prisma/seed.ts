/**
 * Seeds institutions, securities, a demo developer + application, and two pre-connected items
 * with realistic transactions / holdings / identity / income.
 */
import { PrismaClient } from "@prisma/client";
import { INSTITUTIONS } from "../constants/institutions.js";
import { SECURITIES } from "../constants/securities.js";
import { hashPassword, hashSecret, randomToken, sha256Hex } from "../utils/crypto.js";
import {
  generateAccounts,
  generateIdentity,
  generateIncome,
  generateTransactions,
} from "../utils/mockDataGenerator.js";
import { generateInvestments, type SecurityRef } from "../utils/investmentGenerator.js";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

async function upsertInstitutions() {
  for (const i of INSTITUTIONS) {
    await prisma.institution.upsert({
      where: { id: i.id },
      update: { name: i.name, primaryColor: i.primaryColor, supportedProducts: i.supportedProducts, routingNumbers: i.routingNumbers },
      create: { ...i },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`[seed] institutions: ${INSTITUTIONS.length}`);
}

async function upsertSecurities(): Promise<SecurityRef[]> {
  const refs: SecurityRef[] = [];
  const now = new Date();
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
  // eslint-disable-next-line no-console
  console.log(`[seed] securities: ${SECURITIES.length}`);
  return refs;
}

async function seedDemoDeveloper(): Promise<{ developerId: string; applicationId: string; clientId: string; clientSecret: string }> {
  const email = "demo@finlink.dev";
  const existing = await prisma.developer.findUnique({ where: { email } });
  let developerId: string;
  if (existing) {
    developerId = existing.id;
  } else {
    const developer = await prisma.developer.create({
      data: {
        email,
        name: "Demo Developer",
        passwordHash: await hashPassword("demo1234"),
      },
    });
    developerId = developer.id;
  }

  // Always ensure at least one application. Seed secret only on first create (logged).
  let app = await prisma.application.findFirst({ where: { developerId } });
  let clientSecret = "";
  if (!app) {
    const clientId = `cli_${nanoid(24)}`;
    clientSecret = nanoid(40);
    app = await prisma.application.create({
      data: {
        developerId,
        name: "FinLink Demo App",
        description: "Pre-seeded sandbox application",
        clientId,
        clientSecretHash: await hashSecret(clientSecret),
        webhookUrl: null,
        redirectUris: ["http://localhost:5174/link/oauth"],
        allowedProducts: ["transactions", "auth", "balance", "identity", "investments", "income"],
        environment: "sandbox",
      },
    });
  }

  return { developerId, applicationId: app.id, clientId: app.clientId, clientSecret };
}

async function seedItem(opts: {
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
    // Update brokerage balance to total value
    await prisma.account.update({
      where: { id: brokerage.data.id as string },
      data: { currentBalance: inv.totalValue, availableBalance: inv.totalValue },
    });
  }

  // Identity + income
  await prisma.identity.create({ data: generateIdentity(item.id) });
  await prisma.incomeVerification.create({ data: generateIncome(item.id) });

  return { itemId: item.id, accessToken: rawAccessToken };
}

async function main() {
  await upsertInstitutions();
  const securities = await upsertSecurities();
  const demo = await seedDemoDeveloper();

  // Only seed items on a fresh developer (no clientSecret means it already exists).
  const itemCount = await prisma.item.count({ where: { applicationId: demo.applicationId } });
  if (itemCount === 0) {
    // Three investment brokerages so the portfolio view has multi-source data
    const fidelity = await seedItem({
      applicationId: demo.applicationId,
      institutionId: "ins_10",
      clientUserId: "user_demo_1",
      securities,
      products: ["investments", "balance", "identity"],
    });
    const schwab = await seedItem({
      applicationId: demo.applicationId,
      institutionId: "ins_9",
      clientUserId: "user_demo_1",
      securities,
      products: ["investments", "balance", "identity"],
    });
    const robinhood = await seedItem({
      applicationId: demo.applicationId,
      institutionId: "ins_12",
      clientUserId: "user_demo_1",
      securities,
      products: ["investments", "balance", "identity"],
    });
    const chase = await seedItem({
      applicationId: demo.applicationId,
      institutionId: "ins_1",
      clientUserId: "user_demo_1",
      securities,
      products: ["transactions", "auth", "balance", "identity"],
    });
    // eslint-disable-next-line no-console
    console.log(`[seed] demo items created: Fidelity=${fidelity.itemId}, Schwab=${schwab.itemId}, Robinhood=${robinhood.itemId}, Chase=${chase.itemId}`);
  }

  if (demo.clientSecret) {
    // eslint-disable-next-line no-console
    console.log("[seed] demo developer: demo@finlink.dev / demo1234");
    // eslint-disable-next-line no-console
    console.log(`[seed] demo client_id: ${demo.clientId}`);
    // eslint-disable-next-line no-console
    console.log(`[seed] demo client_secret (shown once): ${demo.clientSecret}`);
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
