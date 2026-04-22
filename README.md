# Beacon

A portfolio tracker that pulls your holdings, transactions, and
dividends from every brokerage you own into one dashboard. Auto-sync
with 20+ brokers via SnapTrade, CSV fallback for anything else.

**Live:**
- Dashboard — https://vesly-dashboard.vercel.app
- Status — https://beacon-three-liard.vercel.app
- Changelog — [CHANGELOG.md](./CHANGELOG.md)

**Two ways to try it:**
- **Demo** — hit `/demo` on the live site (or click "Try the demo" on the landing). It auto-signs you into a read-only account pre-seeded with realistic mock data. Nothing you do in there touches real money.
- **Your real accounts** — register, then connect via [SnapTrade's free tier](https://snaptrade.com) (5 connections, no credit card).

**Debugging the demo.** If the demo is ever empty or won't load, `GET https://<backend>/api/demo/status` is a public no-auth endpoint that reports whether the demo developer exists, how many items / holdings it has, and how many institutions / securities are seeded. The `/demo` page also surfaces the same data in a diagnostic panel when it can't open the session.

---

## What's new

The canonical changelog lives in [CHANGELOG.md](./CHANGELOG.md), with
tagged releases published to
[GitHub Releases](https://github.com/kazoosa/Beacon/releases). We keep
those notes in one place — here on GitHub, not duplicated inside the
app.

---

## Free cloud deploy (no credit card)

Get the app running 24/7 without your laptop. Total cost: $0. All four
services below have genuine free tiers that don't require payment info.

**Architecture:**
- **Neon** → Postgres
- **Upstash** → Redis
- **Render** → backend (Node + Prisma + Bull) — deploy config in [`render.yaml`](./render.yaml)
- **Vercel** → dashboard + link-ui (static frontends)

> Earlier iterations of this project used Koyeb for the backend. The
> `koyeb.yaml` still lives in the repo for reference but the live
> deploy is on Render. Use Render for new deploys — it's free-tier,
> supports Blueprints (IaC via `render.yaml`), and has a visible
> deploy log you can watch while this README catches up.

### Step-by-step

1. **GitHub** — push the `finlink/` folder to a repo. This one lives at `https://github.com/kazoosa/Beacon`.

2. **Neon** → https://console.neon.tech/signup → sign in with GitHub → **Create project**. Copy the **connection string** (it includes `?sslmode=require`). That's your `DATABASE_URL`.

3. **Upstash** → https://console.upstash.com → login with GitHub → **Create Database** (Regional, TLS on, same region as Neon). Under **Connect**, pick the **ioredis** tab. Copy the `rediss://...` URL. That's your `REDIS_URL`.

4. **Render** → https://dashboard.render.com → **New → Blueprint** → connect the Beacon repo → Render reads `render.yaml` and creates the web service using `apps/backend/Dockerfile`. Fill in the `sync: false` secrets when prompted. Deploy. Copy the public URL — that's your backend URL.

5. **Vercel** (dashboard) → https://vercel.com/new → import the repo → **Root directory**: `apps/dashboard` → Framework: **Other** (the `vercel.json` handles build config). Environment variables:
   - `VITE_API_URL=https://<your-render-url>`
   - `VITE_LINK_UI_URL=https://<your-link-ui-vercel-url>` (fill in after step 6)

   Deploy and copy the Vercel URL.

6. **Vercel** (link-ui) → **New Project** → same repo → **Root directory**: `apps/link-ui` → deploy. Copy the URL.

7. Back in the dashboard Vercel project → Settings → Env Vars → update `VITE_LINK_UI_URL` → Redeploy.

8. Back in Render → the web service's **Environment** tab → edit:
   - `CORS_ORIGINS=<dashboard URL>,<link-ui URL>`
   - `DASHBOARD_URL=<dashboard URL>`
   - `LINK_UI_URL=<link-ui URL>`

   Save — Render auto-redeploys on env changes.

9. Open the dashboard URL, hit "Try the demo" on the landing (or visit `/demo` directly). Close your laptop. Open the URL from your phone. It works.

**If a deploy didn't auto-trigger** on a push to `main`, open the Render service → **Manual Deploy → Deploy latest commit**. Free-tier builds take 3–8 minutes. Watch the deploy log for `[seedIfEmpty]` and `[demoSeed]` lines to confirm the demo seeded correctly.

### Keeping costs at zero
- **Neon**: 3GB storage, free forever as long as you stay under it.
- **Upstash**: 10k Redis commands/day. A single-user app uses <200/day.
- **Render free web service**: spins down after 15 minutes of inactivity. First request after idle takes 20–60s (cold start pulls the Docker image and re-runs the entrypoint, including the demo seed guard). Every subsequent request is fast.
- **Vercel**: unlimited static hosting on the Hobby plan.

---

## Connecting real brokerages via SnapTrade

The free tier (no credit card) gives you 5 brokerage connections with
real-time positions, orders, and balances.

1. Sign up at **https://dashboard.snaptrade.com/signup**.
2. Verify your email and log in.
3. In the dashboard → **API Keys** → **Create**. You'll get:
   - `Client ID` (public-ish)
   - `Consumer Key` (secret, never commit)
4. Paste both into `.env`:
   ```
   SNAPTRADE_CLIENT_ID=...
   SNAPTRADE_CONSUMER_KEY=...
   ```
5. (Optional, for webhooks) Run `ngrok http 3001`, paste the ngrok URL + `/api/snaptrade/webhooks` into SnapTrade dashboard → Webhooks, copy the signing secret into `SNAPTRADE_WEBHOOK_SECRET`.
6. `docker compose down && docker compose up --build`.
7. Register a new account (not the demo one). Hit "+ Connect brokerage" — SnapTrade's portal opens in a popup. Log in with your real broker credentials.
8. When the popup closes, the dashboard syncs positions and transactions. First sync takes ~30 seconds.

If you don't set the SnapTrade env vars, only the demo account works. The Connect button on any other account shows "SnapTrade is not configured on the server."

---

## Local dev

Requires a local Postgres + Redis. Copy `.env.example` to `.env` and
fill in the connection strings, then:

```bash
pnpm install
pnpm --filter @finlink/backend prisma migrate dev
pnpm --filter @finlink/backend seed
pnpm dev    # runs the backend + both UIs in parallel
```

Default ports when you're running everything locally:

- Backend — `http://localhost:3001`
- Swagger — `http://localhost:3001/api/docs`
- Dashboard — `http://localhost:5174`
- Link UI — `http://localhost:5175`

The seed creates a demo developer with pre-connected institutions and
realistic holdings/transactions. The first-boot log prints the seeded
`client_id` and `client_secret` — copy the secret, it's only shown
once.

Integration tests (need a separate test Postgres; check the root
`docker-compose.yml` for a `postgres-test` service if you want one):

```bash
pnpm test
```

---

## Architecture

```
┌────────────────┐     ┌────────────────┐
│ Dashboard 5174 │     │  Link UI 5175  │  (+ finlink.js SDK)
└────────┬───────┘     └────────┬───────┘
         │                      │
         │  REST                │  session + postMessage
         ▼                      ▼
         ┌──────────────────────────────┐
         │   Backend 3001  (Express)    │
         │  Routes → Services → Prisma  │
         └─────┬────────────────┬───────┘
               │                │
         ┌─────▼─────┐    ┌─────▼─────┐
         │ Postgres  │    │   Redis   │
         └───────────┘    └───────────┘
                          + Bull queue for webhooks
```

### Token model

| Token             | Shape                          | TTL   | Storage                  |
|-------------------|--------------------------------|-------|--------------------------|
| Developer JWT     | JWT HS256 (access + refresh)   | 15m / 30d | Refresh jti in Redis |
| `link_token`      | JWT signed with `LINK_TOKEN_SECRET` | 30m   | Session row by jti   |
| `public_token`    | JWT, single-use                | 30m   | `publicTokenConsumed` + Redis SETNX |
| `access_token`    | opaque `access-sandbox-…`      | ∞     | sha256 on `Item.accessTokenHash` |
| `client_secret`   | random, bcrypt-hashed          | ∞     | shown once on create/rotate |

### Webhook delivery

1. Service emits an event → `WebhookEvent` row inserted (status PENDING).
2. Bull enqueues a `deliver` job.
3. Worker POSTs JSON with `FinLink-Signature: t=…, v1=<HMAC-SHA256>`, timeout 10s.
4. On non-2xx: retry with exponential backoff (30s, 2m, 10m, 1h, 6h) up to 5 attempts.

---

## API reference (short form)

Auth (developer):
- `POST /api/auth/{register,login,refresh,logout}`

Applications (developer JWT):
- `GET|POST /api/applications`
- `PATCH|DELETE /api/applications/:id`
- `POST /api/applications/:id/rotate-secret`
- `GET /api/applications/:id/{metrics,api-logs,webhooks}`
- `POST /api/applications/:id/webhooks/:eventId/retry`
- `POST /api/applications/:id/webhooks/test`

Link (client_id + secret):
- `POST /api/link/token/create`
- `POST /api/link/token/exchange`
- Session endpoints consumed by the modal: `GET /api/link/session`, `POST /api/link/session/{select_institution, submit_credentials, submit_mfa, finalize}`, `GET /api/link/session/:id/preview_accounts`

Item data (access_token as Bearer):
- `GET /api/accounts`, `/api/accounts/balance`
- `GET /api/transactions`, `/api/transactions/sync`, `/api/transactions/:id`
- `POST /api/transactions/refresh`
- `GET /api/investments/holdings`, `/api/investments/transactions`, `/api/investments/securities/:id`
- `GET /api/identity`
- `GET /api/income/verification/{summary,paystubs}`
- `GET /api/items/:item_id`, `DELETE /api/items/:item_id`, `POST /api/items/:item_id/{webhook,refresh}`

Sandbox (access_token):
- `POST /api/sandbox/item/{fire_webhook,reset_login}`
- `POST /api/sandbox/transactions/simulate`
- `GET /api/sandbox/institutions`

Institutions (public):
- `GET /api/institutions`, `/api/institutions/:id`, `/api/institutions/search?query=`

Full spec: http://localhost:3001/api/docs (locally) or the `/api/docs` path on your Koyeb backend URL.

---

## Using the Link SDK (for integrators)

If you're building on top of Beacon's Plaid-compatible backend:

```html
<script src="http://localhost:5175/dist/sdk/finlink.js"></script>
<script>
  // Server-side: POST /api/link/token/create → { link_token }
  const handler = FinLink.create({
    token: linkToken,
    onSuccess(public_token, metadata) {
      fetch("/server/exchange", { method: "POST", body: JSON.stringify({ public_token }) });
    },
    onExit(err, metadata) { /* user closed */ },
    onEvent(name, payload) { /* OPEN, SELECT_INSTITUTION, SUBMIT_CREDENTIALS, ... */ },
  });
  handler.open();
</script>
```

In sandbox: any credentials succeed except the literal username `user_bad`, which simulates 3 failed attempts. Any 6-digit MFA code works, except `000000` which fails.

---

## What's in the box

- Full REST API with Swagger at `/api/docs`
- Link UI modal — search → credentials → MFA → accounts → consent → success
- `public_token` → `access_token` exchange
- Realistic seeded data (transactions, holdings, identity, income)
- Dashboard with holdings, dividends, allocation, transactions
- Three.js shader sign-in page (real auth, email + password)
- Webhook delivery with HMAC signatures and exponential backoff
- Rate limiting via Redis sliding window
- `docker compose up` brings up the whole stack

---

## Stack

- **Backend** — Express, Prisma, Postgres, Redis, Bull
- **Dashboard** (`apps/dashboard`) — Vite + React 18 + React Router + TanStack Query + Tailwind + Three.js
- **Link UI** (`apps/link-ui`) — Vite + React, embeddable modal
- **Monorepo** — pnpm workspaces
