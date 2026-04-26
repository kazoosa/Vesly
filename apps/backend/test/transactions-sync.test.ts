import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetDb, seedInstitutions, createDeveloper, createApplication, prisma } from "./helpers.js";
import { issueAccessToken } from "../src/services/tokenService.js";
import { generateAccounts, generateTransactions } from "../src/utils/mockDataGenerator.js";

let app: ReturnType<typeof createApp>;

async function setupItem() {
  const { dev } = await createDeveloper();
  const { app: application } = await createApplication(dev.id);
  const { raw, hash } = issueAccessToken();
  const item = await prisma.item.create({
    data: {
      applicationId: application.id,
      institutionId: "ins_1",
      clientUserId: "user_sync",
      accessTokenHash: hash,
      status: "GOOD",
      products: ["transactions"],
    },
  });
  const accs = generateAccounts({ itemId: item.id, products: ["transactions"] });
  await prisma.account.createMany({ data: accs.map((a) => a.data) });
  for (const a of accs) {
    if (a.role === "brokerage") continue;
    const txs = generateTransactions({ itemId: item.id, accountId: a.data.id as string, accountRole: a.role, days: 10 });
    await prisma.transaction.createMany({ data: txs });
  }
  return { accessToken: raw, itemId: item.id };
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDb();
  await seedInstitutions();
});

describe("transactions sync", () => {
  it("paginates with cursor until has_more is false", async () => {
    const { accessToken } = await setupItem();
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    while (pages < 20) {
      // Build the query string with count always present and cursor
      // optional. The previous form was `?cursor=…&count=10` when
      // cursor existed and `&count=10` when it didn't — the second
      // shape produces the literal path `/sync&count=10` which 404s.
      const params = new URLSearchParams({ count: "10" });
      if (cursor) params.set("cursor", cursor);
      const res = await request(app)
        .get(`/api/transactions/sync?${params.toString()}`)
        .set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      for (const tx of res.body.added) seen.add(tx.transaction_id);
      cursor = res.body.next_cursor;
      pages++;
      if (!res.body.has_more) break;
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});
