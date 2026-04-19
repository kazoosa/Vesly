# All Account Stocks

A dark-mode personal portfolio tracker that consolidates all your brokerage accounts into one view: holdings, transactions, dividends, and allocation — across Fidelity, Schwab, Robinhood, Vanguard, and 30+ more.

**Two modes:**
- **Demo account** (`demo@finlink.dev` / `demo1234`) — pre-seeded with realistic mock data. No signup needed.
- **Real account** — register a new user, connect your actual brokerages via [SnapTrade](https://snaptrade.com)'s free tier.

## Free cloud deploy (no credit card)

Get the app running 24/7 without your laptop. Total cost: $0. All four services below have genuine free tiers that don't require payment info.

**Architecture:**
- **Neon** → Postgres
- **Upstash** → Redis
- **Koyeb** → backend (Node + Prisma + Bull)
- **Vercel** → dashboard + link-ui (static frontends)

### Step-by-step

1. **GitHub**: push this repo to a GitHub repo. (Create one at `https://github.com/new`, then from the `finlink/` folder: `git init && git add . && git commit -m "init" && git remote add origin https://github.com/<you>/all-account-stocks.git && git push -u origin main`.)

2. **Neon** → https://console.neon.tech/signup → sign in with GitHub → **Create project** (name: `all-account-stocks`). Copy the **connection string** (includes `?sslmode=require`). That's your `DATABASE_URL`.

3. **Upstash** → https://console.upstash.com → Login with GitHub → **Create Database** (Regional, TLS on, same region as Neon). Under **Connect**, pick the **ioredis** tab. Copy the `rediss://...` URL. That's your `REDIS_URL`.

4. **Koyeb** → https://app.koyeb.com/auth/signup → GitHub sign-in → **Create Web Service** → Deploy from GitHub → pick the `all-account-stocks` repo → Builder: **Dockerfile**, Dockerfile path: `apps/backend/Dockerfile`, exposed port: `3001`, health check path: `/health`. Instance: **Free**. Under **Environment variables**, paste every variable from `.env.production.example` (marking sensitive ones as Secret). Deploy. Copy the public URL — that's your backend URL.

5. **Vercel** (dashboard) → https://vercel.com/new → import the GitHub repo → **Root directory**: `apps/dashboard` → Framework: **Other** → Build & Output: detected from `vercel.json`. Under **Environment Variables**, add:
   - `VITE_API_URL=https://<your-koyeb-url>`
   - `VITE_LINK_UI_URL=https://<your-link-ui-vercel-url>` (fill in after step 6)
   Deploy. Copy the Vercel URL.

6. **Vercel** (link-ui) → **New Project** → same GitHub repo → **Root directory**: `apps/link-ui` → deploy. Copy the URL.

7. **Back to Vercel dashboard project** → Settings → Env Vars → update `VITE_LINK_UI_URL` → Redeploy.

8. **Back to Koyeb** → edit the backend service's env vars:
   - `CORS_ORIGINS=<dashboard URL>,<link-ui URL>`
   - `DASHBOARD_URL=<dashboard URL>`
   - `LINK_UI_URL=<link-ui URL>`
   Redeploy.

9. Open the dashboard Vercel URL → log in as `demo@finlink.dev` / `demo1234`. Close your laptop. Open the URL from your phone. It works.

### Keeping costs at zero
- **Neon**: 3GB storage, free forever as long as you stay under it.
- **Upstash**: 10k Redis commands/day. A single-user app uses <200/day.
- **Koyeb free instance**: scales to zero after inactivity. Cold-start takes ~5s on first request.
- **Vercel**: unlimited static hosting on the Hobby plan.

## Connecting real brokerages via SnapTrade

The free tier (no credit card) gives you **5 brokerage connections** with real-time positions, orders, and balances.

1. Sign up: **https://dashboard.snaptrade.com/signup**
2. Verify your email and log in.
3. In the dashboard → **API Keys** → click "Create". You'll see:
   - `Client ID` (public-ish)
   - `Consumer Key` (secret — never commit)
4. Paste both into `.env`:
   ```
   SNAPTRADE_CLIENT_ID=...
   SNAPTRADE_CONSUMER_KEY=...
   ```
5. (Optional, for webhooks) Run `ngrok http 3001`, paste the ngrok URL + `/api/snaptrade/webhooks` into SnapTrade dashboard → Webhooks, copy the signing secret into `SNAPTRADE_WEBHOOK_SECRET`.
6. `docker compose down && docker compose up --build`.
7. Register a new account on the dashboard (not the demo one). Click "+ Connect brokerage" in the sidebar — SnapTrade's portal opens in a popup. Log in with your real broker credentials.
8. After the popup closes, the dashboard syncs your positions and transactions. Takes ~30 seconds on first connect.

If you don't set the SnapTrade env vars, only the demo account works — the Connect button on any other account will show "SnapTrade is not configured on the server."

---

# FinLink

A full-stack, Plaid-compatible sandbox. Three apps sharing one backend:

- **Backend** — Express + Prisma + Redis + Bull. Full REST API with Swagger docs at `/api/docs`.
- **Link UI** (`apps/link-ui`) — the embeddable modal + JS SDK (`finlink.js`).
- **Dashboard** (`apps/dashboard`) — developer console with apps, data explorer, webhooks, and API logs.

Everything runs with `docker compose up` and is pre-seeded with realistic data.

---

## Quickstart

```bash
cp .env.example .env
docker compose up --build
```

That boots:

| Service   | URL                                 |
|-----------|-------------------------------------|
| Backend   | http://localhost:3001               |
| Swagger   | http://localhost:3001/api/docs      |
| Dashboard | http://localhost:5174               |
| Link UI   | http://localhost:5175               |
| Postgres  | localhost:5432 (finlink/finlink)    |
| Redis     | localhost:6379                      |

On first boot the backend runs Prisma migrations, seeds 20 institutions, ~15 securities, a demo developer, and two pre-connected items.

**Demo credentials**

```
Email:    demo@finlink.dev
Password: demo1234
```

The first-boot log prints the seeded `client_id` and `client_secret` — copy the secret, it's only shown once.

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

Full spec: **http://localhost:3001/api/docs**

---

## Using the Link SDK

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

In sandbox: any credentials succeed (except the literal username `user_bad`, which simulates 3 failed attempts). Any 6-digit MFA code is accepted, except `000000` which fails.

---

## Local dev (without Docker)

```bash
pnpm install
# requires Postgres + Redis running locally
cp .env.example .env
pnpm --filter @finlink/backend prisma migrate dev
pnpm --filter @finlink/backend seed
pnpm dev    # runs backend + both UIs in parallel
```

Integration tests (needs `postgres-test` on port 5433):

```bash
docker compose --profile test up -d postgres-test
pnpm test
```

---

## What's in the box

- [x] Full REST API with Swagger at `/api/docs`
- [x] Link UI modal — search → credentials → MFA → accounts → consent → success
- [x] `public_token` → `access_token` exchange
- [x] Realistic seeded data (transactions, holdings, identity, income)
- [x] Dashboard shows live data from the backend
- [x] Data Explorer: accounts, transactions, investments, identity, income
- [x] Webhook delivery with HMAC signatures + exponential backoff
- [x] Rate limiting via Redis sliding window
- [x] `docker compose up` brings up the whole stack
