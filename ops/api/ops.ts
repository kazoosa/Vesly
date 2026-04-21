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
  ] = (await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM "Developer"`,
    sql`SELECT COUNT(*)::int AS n FROM "Developer" WHERE "createdAt" >= NOW() - INTERVAL '1 day'`,
    sql`SELECT COUNT(*)::int AS n FROM "Developer" WHERE "createdAt" >= NOW() - INTERVAL '7 days'`,
    sql`SELECT COUNT(*)::int AS n FROM "Item" WHERE status = 'GOOD'`,
    sql`SELECT COUNT(*)::int AS n FROM "InvestmentHolding"`,
    sql`SELECT email, "createdAt" FROM "Developer" ORDER BY "createdAt" DESC LIMIT 5`,
  ])) as [
    Array<{ n: number }>,
    Array<{ n: number }>,
    Array<{ n: number }>,
    Array<{ n: number }>,
    Array<{ n: number }>,
    Array<{ email: string; createdAt: string }>,
  ];

  const totalUsers = totalUsersRow[0]?.n ?? 0;
  const todaySignups = todaySignupsRow[0]?.n ?? 0;
  const weekSignups = weekSignupsRow[0]?.n ?? 0;
  const items = itemsRow[0]?.n ?? 0;
  const holdings = holdingsRow[0]?.n ?? 0;

  return {
    status: "ok",
    data: {
      totalUsers,
      todaySignups,
      weekSignups,
      items,
      holdings,
      avgHoldingsPerUser: totalUsers > 0 ? +(holdings / totalUsers).toFixed(1) : 0,
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

  const [business, render, vercel, neon, upstash, github, health] = await Promise.all([
    safe("business", getBusinessMetrics),
    safe("render", getRender),
    safe("vercel", getVercel),
    safe("neon", getNeon),
    safe("upstash", getUpstash),
    safe("github", getGitHub),
    safe("health", getHealth),
  ]);

  return new Response(
    JSON.stringify({
      ok: true,
      timestamp: new Date().toISOString(),
      services: { business, render, vercel, neon, upstash, github, health },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    },
  );
}
