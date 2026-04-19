import { PrismaClient } from "@prisma/client";
import { hashPassword, hashSecret } from "../src/utils/crypto.js";
import { nanoid } from "nanoid";
import { INSTITUTIONS } from "../src/constants/institutions.js";

const prisma = new PrismaClient();

export async function resetDb() {
  // Order matters for FK constraints; cascade covers most
  await prisma.webhookEvent.deleteMany();
  await prisma.apiLog.deleteMany();
  await prisma.linkSession.deleteMany();
  await prisma.investmentTransaction.deleteMany();
  await prisma.investmentHolding.deleteMany();
  await prisma.transactionTombstone.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.identity.deleteMany();
  await prisma.incomeVerification.deleteMany();
  await prisma.account.deleteMany();
  await prisma.item.deleteMany();
  await prisma.application.deleteMany();
  await prisma.developer.deleteMany();
  await prisma.security.deleteMany();
  await prisma.institution.deleteMany();
}

export async function seedInstitutions() {
  for (const i of INSTITUTIONS) {
    await prisma.institution.upsert({
      where: { id: i.id },
      update: {},
      create: i,
    });
  }
}

export async function createDeveloper(email = `dev_${nanoid(6)}@x.com`, password = "password1") {
  const dev = await prisma.developer.create({
    data: { email, name: "Test", passwordHash: await hashPassword(password) },
  });
  return { dev, password };
}

export async function createApplication(developerId: string) {
  const clientId = `cli_${nanoid(24)}`;
  const secret = nanoid(40);
  const app = await prisma.application.create({
    data: {
      developerId,
      name: "Test App",
      clientId,
      clientSecretHash: await hashSecret(secret),
      allowedProducts: ["transactions", "auth", "balance", "identity", "investments", "income"],
      redirectUris: [],
      environment: "sandbox",
    },
  });
  return { app, clientSecret: secret };
}

export { prisma };
