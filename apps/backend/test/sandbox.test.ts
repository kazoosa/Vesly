import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetDb, seedInstitutions, createDeveloper, createApplication, prisma } from "./helpers.js";
import { issueAccessToken } from "../src/services/tokenService.js";
import { generateAccounts } from "../src/utils/mockDataGenerator.js";

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDb();
  await seedInstitutions();
});

describe("sandbox", () => {
  it("fire_webhook creates a WebhookEvent row", async () => {
    const { dev } = await createDeveloper();
    const { app: application } = await createApplication(dev.id);
    const { raw, hash } = issueAccessToken();
    const item = await prisma.item.create({
      data: {
        applicationId: application.id,
        institutionId: "ins_1",
        clientUserId: "u",
        accessTokenHash: hash,
        products: ["transactions"],
      },
    });
    const accs = generateAccounts({ itemId: item.id, products: ["transactions"] });
    await prisma.account.createMany({ data: accs.map((a) => a.data) });

    const res = await request(app).post("/api/sandbox/item/fire_webhook").send({
      access_token: raw,
      webhook_code: "TRANSACTIONS_DEFAULT_UPDATE",
    });
    expect(res.status).toBe(200);

    const events = await prisma.webhookEvent.findMany({ where: { applicationId: application.id } });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.webhookCode).toBe("TRANSACTIONS_DEFAULT_UPDATE");
  });
});
