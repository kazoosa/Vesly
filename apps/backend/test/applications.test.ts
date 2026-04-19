import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetDb } from "./helpers.js";

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDb();
});

async function registerAndLogin() {
  const reg = await request(app).post("/api/auth/register").send({
    email: "app@example.com",
    name: "App Owner",
    password: "appowner1",
  });
  return reg.body.access_token as string;
}

describe("applications CRUD", () => {
  it("creates, lists, updates, rotates, deletes", async () => {
    const token = await registerAndLogin();
    const auth = { Authorization: `Bearer ${token}` };

    const create = await request(app).post("/api/applications").set(auth).send({
      name: "A1",
      allowed_products: ["transactions"],
    });
    expect(create.status).toBe(201);
    expect(create.body.client_id).toBeTruthy();
    const secret = create.body.client_secret as string;
    expect(secret).toBeTruthy();

    const list = await request(app).get("/api/applications").set(auth);
    expect(list.status).toBe(200);
    expect(list.body.applications.length).toBe(1);

    const patch = await request(app)
      .patch(`/api/applications/${create.body.id}`)
      .set(auth)
      .send({ name: "A1 renamed" });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe("A1 renamed");

    const rotate = await request(app).post(`/api/applications/${create.body.id}/rotate-secret`).set(auth);
    expect(rotate.status).toBe(200);
    expect(rotate.body.client_secret).not.toBe(secret);

    const del = await request(app).delete(`/api/applications/${create.body.id}`).set(auth);
    expect(del.status).toBe(200);
  });
});
