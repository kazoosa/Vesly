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

describe("auth", () => {
  it("registers a developer and logs in", async () => {
    const reg = await request(app).post("/api/auth/register").send({
      email: "alice@example.com",
      name: "Alice",
      password: "alicepass1",
    });
    expect(reg.status).toBe(201);
    expect(reg.body.access_token).toBeTruthy();
    expect(reg.body.refresh_token).toBeTruthy();

    const login = await request(app).post("/api/auth/login").send({
      email: "alice@example.com",
      password: "alicepass1",
    });
    expect(login.status).toBe(200);
    expect(login.body.access_token).toBeTruthy();
  });

  it("rejects wrong password", async () => {
    await request(app).post("/api/auth/register").send({
      email: "bob@example.com",
      name: "Bob",
      password: "bobpass123",
    });
    const login = await request(app).post("/api/auth/login").send({
      email: "bob@example.com",
      password: "wrong",
    });
    expect(login.status).toBe(401);
  });

  it("refreshes access tokens", async () => {
    const reg = await request(app).post("/api/auth/register").send({
      email: "carol@example.com",
      name: "Carol",
      password: "carolpass1",
    });
    const refresh = await request(app)
      .post("/api/auth/refresh")
      .send({ refresh_token: reg.body.refresh_token });
    expect(refresh.status).toBe(200);
    expect(refresh.body.access_token).toBeTruthy();
    // Old refresh is rotated out
    const reuse = await request(app)
      .post("/api/auth/refresh")
      .send({ refresh_token: reg.body.refresh_token });
    expect(reuse.status).toBe(401);
  });
});
