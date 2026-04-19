import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetDb, seedInstitutions, createDeveloper, createApplication, prisma } from "./helpers.js";

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDb();
  await seedInstitutions();
});

describe("link flow", () => {
  it("creates link_token → session → public_token → access_token", async () => {
    const { dev } = await createDeveloper();
    const { app: application, clientSecret } = await createApplication(dev.id);

    // 1. Create link token
    const tokenRes = await request(app).post("/api/link/token/create").send({
      client_id: application.clientId,
      secret: clientSecret,
      user: { client_user_id: "user_1" },
      products: ["transactions", "auth"],
      client_name: "TestApp",
    });
    expect(tokenRes.status).toBe(200);
    const linkToken = tokenRes.body.link_token as string;
    expect(linkToken).toBeTruthy();

    // 2. Resolve session
    const sessRes = await request(app).get(`/api/link/session?token=${linkToken}`);
    expect(sessRes.status).toBe(200);
    const sessionId = sessRes.body.session_id as string;

    // 3. Select institution
    await request(app).post("/api/link/session/select_institution").send({
      session_id: sessionId,
      institution_id: "ins_1",
    });

    // 4. Credentials
    await request(app).post("/api/link/session/submit_credentials").send({
      session_id: sessionId,
      username: "user_good",
      password: "any",
    });

    // 5. MFA if required
    const sess2 = await prisma.linkSession.findUnique({ where: { id: sessionId } });
    if (sess2?.mfaRequired) {
      await request(app).post("/api/link/session/submit_mfa").send({ session_id: sessionId, code: "123456" });
    }

    // 6. Preview accounts + finalize
    const prev = await request(app).get(`/api/link/session/${sessionId}/preview_accounts`);
    expect(prev.status).toBe(200);
    const firstAcc = prev.body.accounts[0].id as string;

    const fin = await request(app).post("/api/link/session/finalize").send({
      session_id: sessionId,
      account_ids: [firstAcc],
    });
    expect(fin.status).toBe(200);
    const publicToken = fin.body.public_token as string;

    // 7. Exchange
    const exch = await request(app).post("/api/link/token/exchange").send({ public_token: publicToken });
    expect(exch.status).toBe(200);
    const accessToken = exch.body.access_token as string;
    expect(accessToken.startsWith("access-sandbox-")).toBe(true);

    // 8. Use access token
    const accounts = await request(app)
      .get("/api/accounts")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(accounts.status).toBe(200);
    expect(accounts.body.accounts.length).toBeGreaterThan(0);

    // 9. Cannot reuse public_token
    const reuse = await request(app).post("/api/link/token/exchange").send({ public_token: publicToken });
    expect(reuse.status).toBe(400);
  });
});
