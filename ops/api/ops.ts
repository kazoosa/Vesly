// Vercel serverless function — fans out to every infra provider in parallel,
// normalizes the responses, returns a single JSON payload the ops page renders.

import { neon } from "@neondatabase/serverless";

export const config = { runtime: "edge" };

type Status = "ok" | "warn" | "error" | "unconfigured";

interface ServiceResult {
  status: Status;
  message?: string;
  data?: Record<string, unknown>;
  error?: string;
}

function unconfigured(msg: string): ServiceResult {
  return { status: "unconfigured", message: msg };
}

function safe<T>(label: string, fn: () => Promise<T>): Promise<T | ServiceResult> {
  return fn().catch((err) => ({
    status: "error" as Status,
    error: `${label}: ${(err as Error).message}`,
  }));
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function fmtTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/* ---------------------------------------- business metrics (from Neon DB) */

async function getBusinessMetrics(): Promise<ServiceResult> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return unconfigured(
      "Set DATABASE_URL in Vercel env to see user metrics. Use the same Neon connection string as the backend.",
    );
  }
  const sql = neon(url);

  // Parallel queries — each returns a single row
  const [
    totalUsersRow,
    todaySignupsRow,
    weekSignupsRow,
    itemsRow,
    holdingsRow,
    recentSignups,
    monthSignupsByDay,
    activeUsers7d,
    topBroker,
    syncErrorsLastHour,
    syncRateRows,
  ] = (await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM "Developer"`,
    sql`SELECT COUNT(*)::int AS n FROM "Developer" WHERE "createdAt" >= NOW() - INTERVAL '1 day'`,
    sql`SELECT COUNT(*)::int AS n FROM "Developer" WHERE "createdAt" >= NOW() - INTERVAL '7 days'`,
    sql`SELECT COUNT(*)::int AS n FROM "Item" WHERE status = 'GOOD'`,
    sql`SELECT COUNT(*)::int AS n FROM "InvestmentHolding"`,
    sql`SELECT email, "createdAt" FROM "Developer" ORDER BY "createdAt" DESC LIMIT 5`,
    // Per-day signup counts for the last 30 days — drives the
    // sparkline widget. Always 30 rows, padded with zero where no
    // signups happened that day.
    sql`
      WITH days AS (
        SELECT generate_series(
          (CURRENT_DATE - INTERVAL '29 days')::date,
          CURRENT_DATE,
          '1 day'::interval
        )::date AS day
      )
      SELECT
        days.day::text AS day,
        COALESCE(COUNT(d.id), 0)::int AS n
      FROM days
      LEFT JOIN "Developer" d ON DATE(d."createdAt") = days.day
      GROUP BY days.day
      ORDER BY days.day ASC
    `,
    // "Active in last 7 days" — best proxy we have without a
    // LoginEvent table is "an Item belonging to this developer
    // had its updatedAt touch in the last 7 days" (sync writes).
    sql`
      SELECT COUNT(DISTINCT a."developerId")::int AS n
      FROM "Application" a
      INNER JOIN "Item" i ON i."applicationId" = a.id
      WHERE i."updatedAt" >= NOW() - INTERVAL '7 days'
    `,
    // Top broker by connection count — institution is referenced by
    // Item.institutionId. Display top one only.
    sql`
      SELECT inst.name AS name, COUNT(*)::int AS n
      FROM "Item" i
      INNER JOIN "Institution" inst ON inst.id = i."institutionId"
      WHERE i.status = 'GOOD'
      GROUP BY inst.name
      ORDER BY n DESC
      LIMIT 1
    `,
    // ApiLog rows with status >= 500 in the last hour. Will be 0
    // if no errors logged or if ApiLog is empty.
    sql`
      SELECT COUNT(*)::int AS n
      FROM "ApiLog"
      WHERE "createdAt" >= NOW() - INTERVAL '1 hour'
        AND "responseStatus" >= 500
    `,
    // Sync success rate over the last 24h — driven by ApiLog rows
    // matching the SnapTrade sync route. Returns total + success
    // count so the widget can show % and absolute counts.
    sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "responseStatus" < 400)::int AS ok
      FROM "ApiLog"
      WHERE "createdAt" >= NOW() - INTERVAL '1 day'
        AND "endpoint" LIKE '%/snaptrade/sync%'
    `,
  ])) as [
    Array<{ n: number }>,
    Array<{ n: number }>,
    Array<{ n: number }>,
    Array<{ n: number }>,
    Array<{ n: number }>,
    Array<{ email: string; createdAt: string }>,
    Array<{ day: string; n: number }>,
    Array<{ n: number }>,
    Array<{ name: string; n: number }>,
    Array<{ n: number }>,
    Array<{ total: number; ok: number }>,
  ];

  const totalUsers = totalUsersRow[0]?.n ?? 0;
  const todaySignups = todaySignupsRow[0]?.n ?? 0;
  const weekSignups = weekSignupsRow[0]?.n ?? 0;
  const items = itemsRow[0]?.n ?? 0;
  const holdings = holdingsRow[0]?.n ?? 0;
  const activeUsers = activeUsers7d[0]?.n ?? 0;
  const topBrokerName = topBroker[0]?.name ?? null;
  const topBrokerCount = topBroker[0]?.n ?? 0;
  const errorRate1h = syncErrorsLastHour[0]?.n ?? 0;
  const syncTotal24h = syncRateRows[0]?.total ?? 0;
  const syncOk24h = syncRateRows[0]?.ok ?? 0;
  const syncSuccessPct =
    syncTotal24h > 0 ? +((syncOk24h / syncTotal24h) * 100).toFixed(1) : null;

  return {
    status: "ok",
    data: {
      totalUsers,
      todaySignups,
      weekSignups,
      items,
      holdings,
      avgHoldingsPerUser: totalUsers > 0 ? +(holdings / totalUsers).toFixed(1) : 0,
      activeUsers7d: activeUsers,
      topBrokerName,
      topBrokerCount,
      errorRate1h,
      syncTotal24h,
      syncOk24h,
      syncSuccessPct,
      signupSparkline: monthSignupsByDay,
      _recentSignups: recentSignups.map((r) => ({
        title: r.email,
        time: fmtTime(r.createdAt),
      })),
    },
  };
}

/* ------------------------------------------------------ infra providers */

async function getRender(): Promise<ServiceResult> {
  const key = process.env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID;
  if (!key || !serviceId) {
    return unconfigured("Set RENDER_API_KEY and RENDER_SERVICE_ID.");
  }
  const headers = { Authorization: `Bearer ${key}` };
  const [svc, deploys] = await Promise.all([
    fetchJson(`https://api.render.com/v1/services/${serviceId}`, { headers }),
    fetchJson(
      `https://api.render.com/v1/services/${serviceId}/deploys?limit=5`,
      { headers },
    ),
  ]);
  const s = svc as Record<string, unknown>;
  const deploysArr = deploys as Array<{ deploy: Record<string, unknown> }>;
  const latestDeploy = deploysArr[0]?.deploy;
  const status: Status =
    (latestDeploy?.status as string) === "live"
      ? "ok"
      : (latestDeploy?.status as string) === "build_failed" ||
          (latestDeploy?.status as string) === "update_failed"
        ? "error"
        : "warn";

  return {
    status,
    data: {
      name: String(s.name ?? "backend"),
      region: String(s.region ?? "—"),
      "service status":
        s.suspended === "not_suspended" ? "running" : "suspended",
      "last deploy": fmtTime(latestDeploy?.createdAt as string),
      "deploy status": String(latestDeploy?.status ?? "unknown"),
      "last change": String(
        (latestDeploy?.commit as Record<string, unknown>)?.message ?? "—",
      )
        .split("\n")[0]!
        .slice(0, 80),
      _events: deploysArr.slice(0, 5).map((d) => ({
        title: `${d.deploy.status} · ${String(
          (d.deploy.commit as Record<string, unknown>)?.message ?? "",
        )
          .split("\n")[0]!
          .slice(0, 50)}`,
        time: fmtTime(d.deploy.createdAt as string),
      })),
    },
  };
}

async function getVercel(): Promise<ServiceResult> {
  const token = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token) return unconfigured("Set VERCEL_API_TOKEN.");
  const q = teamId ? `?teamId=${teamId}&limit=20` : "?limit=20";
  const headers = { Authorization: `Bearer ${token}` };
  const deployments = (await fetchJson(
    `https://api.vercel.com/v6/deployments${q}`,
    { headers },
  )) as { deployments: Array<Record<string, unknown>> };

  const deploys = deployments.deployments;
  const latest = deploys[0];
  const state = (latest?.state ?? latest?.readyState) as string;
  const status: Status = state === "READY" ? "ok" : state === "ERROR" ? "error" : "warn";

  const byProject = new Map<string, Record<string, unknown>>();
  for (const d of deploys) {
    const name = String(d.name ?? "unknown");
    if (!byProject.has(name)) byProject.set(name, d);
  }

  return {
    status,
    data: {
      ...Object.fromEntries(
        [...byProject.entries()].map(([name, d]) => [
          name,
          `${d.state ?? d.readyState} · ${fmtTime(
            typeof d.createdAt === "number"
              ? new Date(d.createdAt).toISOString()
              : (d.createdAt as string),
          )}`,
        ]),
      ),
      _events: deploys.slice(0, 5).map((d) => ({
        title: `${d.name}: ${d.state ?? d.readyState}`,
        time: fmtTime(
          typeof d.createdAt === "number"
            ? new Date(d.createdAt).toISOString()
            : (d.createdAt as string),
        ),
      })),
    },
  };
}

async function getNeon(): Promise<ServiceResult> {
  const key = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!key || !projectId) {
    return unconfigured("Set NEON_API_KEY and NEON_PROJECT_ID.");
  }
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  const proj = (await fetchJson(
    `https://console.neon.tech/api/v2/projects/${projectId}`,
    { headers },
  )) as { project: Record<string, unknown> };
  const branches = (await fetchJson(
    `https://console.neon.tech/api/v2/projects/${projectId}/branches`,
    { headers },
  )) as { branches: Array<Record<string, unknown>> };

  const p = proj.project;
  const sizeBytes = Number(p.data_storage_bytes_hour ?? 0);
  const computeCu = Number(p.cpu_used_sec ?? 0) / 3600;

  return {
    status: "ok",
    data: {
      name: (p.name as string) ?? "neon",
      branches: branches.branches.length,
      storageBytes: sizeBytes,
      storageHuman: bytes(sizeBytes),
      computeHours: +computeCu.toFixed(3),
      pgVersion: String(p.pg_version ?? "—"),
    },
  };
}

async function getDbHealth(): Promise<ServiceResult> {
  const url = process.env.DATABASE_URL;
  if (!url) return unconfigured("DATABASE_URL not set");
  const sql = neon(url);
  // Three lightweight queries — pure timing exercise. NOT a load test;
  // we just want a current latency number the user can sanity-check
  // against historical norms. Run sequentially so the times are
  // additive and don't share connection setup costs.
  const t0 = Date.now();
  await sql`SELECT 1`;
  const t1 = Date.now();
  const tableCount = (await sql`
    SELECT COUNT(*)::int AS n
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `) as Array<{ n: number }>;
  const t2 = Date.now();
  const longestTable = (await sql`
    SELECT relname, n_live_tup::bigint AS rows
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC NULLS LAST
    LIMIT 1
  `) as Array<{ relname: string; rows: number }>;
  const t3 = Date.now();
  const pingMs = t1 - t0;
  const totalMs = t3 - t0;
  const status: Status =
    pingMs > 500 ? "warn" : pingMs > 1500 ? "error" : "ok";
  return {
    status,
    data: {
      pingMs,
      schemaQueryMs: t2 - t1,
      statsQueryMs: t3 - t2,
      totalMs,
      publicTables: tableCount[0]?.n ?? 0,
      biggestTable: longestTable[0]?.relname ?? null,
      biggestTableRows: Number(longestTable[0]?.rows ?? 0),
    },
  };
}

async function getUpstash(): Promise<ServiceResult> {
  const email = process.env.UPSTASH_EMAIL;
  const apiKey = process.env.UPSTASH_API_KEY;
  const dbId = process.env.UPSTASH_DATABASE_ID;
  if (!email || !apiKey || !dbId) {
    return unconfigured(
      "Set UPSTASH_EMAIL, UPSTASH_API_KEY, UPSTASH_DATABASE_ID.",
    );
  }
  const auth = btoa(`${email}:${apiKey}`);
  const headers = { Authorization: `Basic ${auth}` };
  const db = (await fetchJson(
    `https://api.upstash.com/v2/redis/database/${dbId}`,
    { headers },
  )) as Record<string, unknown>;

  return {
    status: "ok",
    data: {
      name: String(db.database_name ?? "redis"),
      commandsToday: Number(db.daily_requests ?? 0),
      bandwidthBytes: Number(db.daily_bandwidth ?? 0),
      storageBytes: Number(db.db_disk_threshold ?? 0),
      keys: Number(db.db_size ?? 0),
    },
  };
}

async function getGitHub(): Promise<ServiceResult> {
  const repo = process.env.GITHUB_REPO ?? "kazoosa/Beacon";
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const [commits, prs] = await Promise.all([
    fetchJson(`https://api.github.com/repos/${repo}/commits?per_page=5`, {
      headers,
    }),
    fetchJson(
      `https://api.github.com/repos/${repo}/pulls?state=open&per_page=10`,
      { headers },
    ),
  ]);

  const commitArr = commits as Array<{
    sha: string;
    commit: { message: string; author: { date: string } };
  }>;
  const prArr = prs as Array<{ title: string; number: number }>;

  return {
    status: "ok",
    data: {
      openPRs: prArr.length,
      lastCommit: fmtTime(commitArr[0]?.commit?.author?.date),
      lastCommitMessage: commitArr[0]?.commit?.message?.split("\n")[0]?.slice(0, 80) ?? "—",
      _events: commitArr.slice(0, 5).map((c) => ({
        title: c.commit.message.split("\n")[0]!.slice(0, 60),
        time: fmtTime(c.commit.author.date),
      })),
    },
  };
}

async function getHealth(): Promise<ServiceResult> {
  const url = process.env.BACKEND_HEALTH_URL ?? "https://vesly-backend.onrender.com/health";
  const t0 = Date.now();
  const res = await fetch(url, { cache: "no-store" });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    return {
      status: "error",
      error: `${res.status} ${res.statusText}`,
      data: { latencyMs, url },
    };
  }
  const body = (await res.json()) as { ok?: boolean; environment?: string };
  return {
    status: body.ok ? "ok" : "warn",
    data: {
      ok: Boolean(body.ok),
      environment: body.environment ?? "?",
      latencyMs,
      url,
    },
  };
}

/* ----------------------------------------- self-test (live API battery) */

/**
 * End-to-end smoke battery against the deployed backend. Runs the
 * critical paths the dashboard relies on:
 *   1. Mint a demo session (demo developer must exist + have data)
 *   2. Refresh the access token (catches the JWT_SECRET-rotated bug)
 *   3. Fetch holdings, transactions, dividends, accounts as the demo user
 *   4. List supported CSV brokers + auto-detect a Fidelity / IBKR header
 *
 * Surfaces pass / fail per test plus per-test duration. Each failed
 * test rolls the whole "selftest" service into a warning so the
 * status banner reflects "something is wrong" without flipping the
 * overall ops page red.
 */

interface TestResult {
  name: string;
  group: string;
  ok: boolean;
  durationMs: number;
  detail: string;
}

async function runTest(
  group: string,
  name: string,
  fn: () => Promise<string>,
): Promise<TestResult> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, group, ok: true, durationMs: Date.now() - t0, detail };
  } catch (err) {
    return {
      name,
      group,
      ok: false,
      durationMs: Date.now() - t0,
      detail: (err as Error).message ?? "unknown error",
    };
  }
}

async function getSelfTest(): Promise<ServiceResult> {
  const apiBase =
    process.env.BACKEND_API_URL ?? "https://vesly-backend.onrender.com";
  const DEMO_EMAIL = "demo@finlink.dev";

  let demoAccess = "";
  let demoRefresh = "";

  async function callJson<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...((init.headers as Record<string, string> | undefined) ?? {}),
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error_message?: string };
      throw Object.assign(new Error(body.error_message ?? `HTTP ${res.status}`), {
        status: res.status,
      });
    }
    return (await res.json()) as T;
  }

  const tests: TestResult[] = [];

  tests.push(
    await runTest("Health", "Backend reachable (/api/demo/status)", async () => {
      const data = await callJson<{
        demoDeveloperExists: boolean;
        environment: string;
        investmentHoldingCount: number;
      }>("/api/demo/status");
      if (!data.demoDeveloperExists) throw new Error("demo developer missing");
      return `env=${data.environment}, ${data.investmentHoldingCount} demo holdings`;
    }),
  );

  tests.push(
    await runTest("Auth", "POST /api/demo/session mints a token", async () => {
      const body = await callJson<{
        access_token: string;
        refresh_token: string;
        developer: { email: string };
      }>("/api/demo/session", { method: "POST" });
      if (!body.access_token) throw new Error("no access_token");
      if (body.developer.email !== DEMO_EMAIL)
        throw new Error(`unexpected email ${body.developer.email}`);
      demoAccess = body.access_token;
      demoRefresh = body.refresh_token;
      return `signed in as ${body.developer.email}`;
    }),
  );

  tests.push(
    await runTest("Auth", "Normal /login refuses the demo email", async () => {
      let status: number | null = null;
      try {
        await callJson("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: DEMO_EMAIL, password: "demo1234" }),
        });
      } catch (err) {
        status = (err as { status?: number }).status ?? null;
      }
      if (status === 401) return "401 as expected";
      throw new Error(`expected 401, got ${status ?? "200"}`);
    }),
  );

  tests.push(
    await runTest("Auth", "POST /api/auth/refresh swaps tokens", async () => {
      if (!demoRefresh) throw new Error("no demo refresh token from earlier test");
      const body = await callJson<{ access_token: string; refresh_token: string }>(
        "/api/auth/refresh",
        { method: "POST", body: JSON.stringify({ refresh_token: demoRefresh }) },
      );
      if (!body.access_token) throw new Error("no access_token in refresh response");
      demoAccess = body.access_token;
      demoRefresh = body.refresh_token;
      return "swapped successfully";
    }),
  );

  const authedHeaders = () => ({ Authorization: `Bearer ${demoAccess}` });

  tests.push(
    await runTest("Portfolio", "GET /portfolio/holdings", async () => {
      if (!demoAccess) throw new Error("no demo token");
      const data = await callJson<{
        holdings: Array<{ ticker_symbol: string }>;
        total_value: number;
      }>("/api/portfolio/holdings", { headers: authedHeaders() });
      if (data.holdings.length === 0) throw new Error("no holdings returned");
      return `${data.holdings.length} holdings, total $${data.total_value.toFixed(0)}`;
    }),
  );

  tests.push(
    await runTest("Portfolio", "GET /portfolio/transactions", async () => {
      if (!demoAccess) throw new Error("no demo token");
      const data = await callJson<{
        transactions: Array<unknown>;
        total: number;
      }>("/api/portfolio/transactions?count=10", { headers: authedHeaders() });
      if (data.transactions.length === 0) throw new Error("no transactions returned");
      return `${data.transactions.length} of ${data.total} transactions`;
    }),
  );

  tests.push(
    await runTest("Portfolio", "GET /portfolio/dividends", async () => {
      if (!demoAccess) throw new Error("no demo token");
      const data = await callJson<{
        by_month: Array<{ month: string }>;
        ytd_total: number;
        lifetime_total: number;
      }>("/api/portfolio/dividends", { headers: authedHeaders() });
      if (!Array.isArray(data.by_month) || data.by_month.length !== 12)
        throw new Error(`expected 12 months, got ${data.by_month?.length}`);
      return `lifetime $${data.lifetime_total.toFixed(0)}`;
    }),
  );

  tests.push(
    await runTest("Portfolio", "GET /portfolio/accounts", async () => {
      if (!demoAccess) throw new Error("no demo token");
      const data = await callJson<{ accounts: Array<unknown> }>(
        "/api/portfolio/accounts",
        { headers: authedHeaders() },
      );
      return `${data.accounts.length} accounts`;
    }),
  );

  tests.push(
    await runTest("CSV", "GET /csv/brokers lists 7 brokers", async () => {
      if (!demoAccess) throw new Error("no demo token");
      const data = await callJson<{
        brokers: Array<{ key: string; label: string }>;
      }>("/api/csv/brokers", { headers: authedHeaders() });
      const expected = [
        "fidelity",
        "schwab",
        "vanguard",
        "robinhood",
        "td_ameritrade",
        "webull",
        "ibkr",
      ];
      const have = new Set(data.brokers.map((b) => b.key));
      const missing = expected.filter((k) => !have.has(k));
      if (missing.length) throw new Error(`missing brokers: ${missing.join(", ")}`);
      return `${data.brokers.length} brokers, all 7 expected present`;
    }),
  );

  tests.push(
    await runTest("CSV", "POST /csv/detect identifies Fidelity", async () => {
      if (!demoAccess) throw new Error("no demo token");
      const csv =
        "Account Number,Account Name,Symbol,Description,Quantity,Last Price,Cost Basis Total,Average Cost Basis,Type\nX12345,Test,AAPL,Apple,10,180,1500,150,Cash";
      const data = await callJson<{ broker: string | null }>("/api/csv/detect", {
        method: "POST",
        headers: authedHeaders(),
        body: JSON.stringify({ csv }),
      });
      if (data.broker !== "fidelity")
        throw new Error(`expected fidelity, got ${data.broker}`);
      return "detected fidelity";
    }),
  );

  tests.push(
    await runTest("CSV", "POST /csv/detect identifies IBKR", async () => {
      if (!demoAccess) throw new Error("no demo token");
      const csv =
        "Symbol,Asset Class,Quantity,MarkPrice,CostBasisPrice,PositionValue\nAAPL,STK,10,180,150,1800";
      const data = await callJson<{ broker: string | null }>("/api/csv/detect", {
        method: "POST",
        headers: authedHeaders(),
        body: JSON.stringify({ csv }),
      });
      if (data.broker !== "ibkr")
        throw new Error(`expected ibkr, got ${data.broker}`);
      return "detected ibkr";
    }),
  );

  const passing = tests.filter((t) => t.ok).length;
  const failing = tests.length - passing;
  const status: Status = failing === 0 ? "ok" : passing === 0 ? "error" : "warn";
  const totalMs = tests.reduce((s, t) => s + t.durationMs, 0);

  return {
    status,
    data: {
      passing,
      failing,
      total: tests.length,
      totalMs,
      _tests: tests.map((t) => ({
        title: `${t.ok ? "✔" : "✘"} ${t.name}`,
        time: `${t.durationMs} ms`,
        group: t.group,
        ok: t.ok,
        detail: t.detail,
      })),
    },
  };
}

/* --------------------------------------------------------- handler */

export default async function handler(req: Request): Promise<Response> {
  const expected = process.env.OPS_PASSWORD ?? "";
  const provided = req.headers.get("x-ops-password") ?? "";
  if (!expected) {
    return new Response(
      JSON.stringify({ error: "OPS_PASSWORD not set in Vercel env vars." }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  if (provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const [business, render, vercel, neon, upstash, github, health, selftest, dbhealth] = await Promise.all([
    safe("business", getBusinessMetrics),
    safe("render", getRender),
    safe("vercel", getVercel),
    safe("neon", getNeon),
    safe("upstash", getUpstash),
    safe("github", getGitHub),
    safe("health", getHealth),
    safe("selftest", getSelfTest),
    safe("dbhealth", getDbHealth),
  ]);

  return new Response(
    JSON.stringify({
      ok: true,
      timestamp: new Date().toISOString(),
      services: { business, render, vercel, neon, upstash, github, health, selftest, dbhealth },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        // private = browsers cache, CDN doesn't (the response is keyed
        // off the password header). max-age 30s lets a reload within
        // half a minute return instantly. SWR 120s lets the browser
        // serve stale data immediately while revalidating in the
        // background — perceived performance win on the second click.
        "cache-control": "private, max-age=30, stale-while-revalidate=120",
      },
    },
  );
}
