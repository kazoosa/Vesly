import {
  UserPlus, Link2, LayoutDashboard, Coins, Scale,
  ShieldCheck, Upload, PieChart, LineChart, Bell, RefreshCw,
  Lock, Eye, CreditCard, ArrowUpRight, ArrowRight, Check, Plus, X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import RadialOrbitalTimeline, { type TimelineItem } from "../components/ui/radial-orbital-timeline";
import { useReveal } from "../lib/useReveal";
import { BeaconMark } from "../components/BeaconMark";
import { APP_NAME } from "../lib/brand";

/* ==========================================================================
   Stripe-inspired launch page
   - Light surface, cool violet accent (#635bff), colorful mesh gradient hero
   - Source Code Pro for display type, Geist for body text
   - Everything on a 4px grid, generous section padding
   ========================================================================== */

/* ------------------------------------------------------------------ Data */

const timelineData: TimelineItem[] = [
  {
    id: 1,
    title: "Sign up",
    date: "30 seconds",
    content: "Email and a password. No credit card, no phone number, no 10-screen onboarding quiz. You're in before a support chat could load.",
    category: "Start",
    icon: UserPlus,
  },
  {
    id: 2,
    title: "Connect brokerage",
    date: "~2 minutes",
    content: "Auto-sync with 20+ brokerages via read-only OAuth, or drop in a CSV. Your brokerage password never reaches us.",
    category: "Connect",
    icon: Link2,
  },
  {
    id: 3,
    title: "See holdings",
    date: "Instant",
    content: "A single view across every account you've connected. Deduped by ticker, sortable by whatever you care about, and you can expand any row to see which accounts hold it.",
    category: "View",
    icon: LayoutDashboard,
  },
  {
    id: 4,
    title: "Track dividends",
    date: "Automatic",
    content: "YTD totals, a monthly bar chart, your top payers, and a forward 12-month forecast. So you know what's coming in, not just what already did.",
    category: "Income",
    icon: Coins,
  },
  {
    id: 5,
    title: "Rebalance",
    date: "Any time",
    content: "Allocation drift by security, by brokerage, by asset class. Beacon shows you what's overweight and by how much.",
    category: "Optimize",
    icon: Scale,
  },
];

const features = [
  {
    icon: LayoutDashboard,
    title: "Unified holdings",
    body: "Every share you own, across every broker you've connected, in one table. Sort, filter, download.",
    accent: "#635bff",
  },
  {
    icon: RefreshCw,
    title: "Always in sync",
    body: "Background refresh keeps your numbers up to date. Connect once and retire the spreadsheet.",
    accent: "#11efe3",
  },
  {
    icon: Coins,
    title: "Dividend intelligence",
    body: "Monthly income, YTD totals, forward 12-month forecast, and who your biggest payers actually are.",
    accent: "#ffcc55",
  },
  {
    icon: PieChart,
    title: "Allocation breakdown",
    body: "Three views: by security, by brokerage, by asset class. Real concentration, surfaced.",
    accent: "#fb76fa",
  },
  {
    icon: LineChart,
    title: "Performance tracking",
    body: "Day, YTD, and total return. Benchmark against the S&P 500 or pick your own index.",
    accent: "#0073e6",
  },
  {
    icon: Upload,
    title: "CSV fallback",
    body: "Broker not supported yet? Export a CSV and we'll parse it. Every major format, most of the weirder ones too.",
    accent: "#533afd",
  },
];

const differentiators = [
  {
    title: "Every brokerage, not just the US big three",
    body: "Robinhood, IBKR, Vanguard, Wealthsimple, Questrade, DEGIRO, Trading212, Moomoo, eToro, plus Coinbase, Kraken, and Binance. Twenty-plus out of the box.",
  },
  {
    title: "Read-only. Always. We never hold your keys.",
    body: "Auto-sync goes through SnapTrade (and Plaid, for some plans) via OAuth. Your brokerage password never reaches us. We also don't ask for trading permissions.",
  },
  {
    title: "Not a dashboard for apps that already died",
    body: "Mint shut down. Personal Capital got pivoted. Snowball charges you for a pie chart. Beacon is small, affordable, and not trying to sell to anyone.",
  },
  {
    title: "You own your data, and can take it with you",
    body: "One-click CSV export of everything. One-click account deletion that actually deletes. No dark patterns.",
  },
];

const pricingTiers: {
  name: string;
  price: string;
  cadence: string;
  annual?: string;
  blurb: string;
  features: string[];
  cta: string;
  accent?: boolean;
  badge?: string;
  comingSoon?: boolean;
}[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "For trying Beacon on one account.",
    features: [
      "1 brokerage via CSV upload",
      "Holdings and dividends views",
      "Basic allocation breakdown",
      "Light and dark themes",
      "No credit card required",
    ],
    cta: "Get started",
  },
  {
    name: "Pro",
    price: "$8",
    cadence: "per month",
    annual: "or $69 / year",
    blurb: "For investors with real portfolios across multiple accounts.",
    features: [
      "Unlimited brokerages (auto-sync)",
      "Dividend forecast and calendar",
      "Watchlist and price alerts",
      "Capital gains report",
      "Sector and geography allocation",
      "Performance vs S&P 500",
      "Read-only share link",
      "CSV export",
      "Email support",
    ],
    cta: "Start Pro",
    accent: true,
    badge: "Most popular",
  },
  {
    name: "Elite",
    price: "$15",
    cadence: "per month",
    annual: "or $129 / year",
    blurb: "For people who want AI-powered portfolio analysis.",
    features: [
      "Everything in Pro",
      "AI portfolio analysis",
      "AI rebalance recommendations",
      "Monthly AI portfolio letter",
      "Natural-language queries",
      "Tax-loss harvesting plan",
      "Wash-sale detection",
      "Custom benchmarks",
      "Priority support",
    ],
    cta: "Coming soon",
    comingSoon: true,
  },
];

const faqItems: { q: string; a: string }[] = [
  {
    q: "Which brokerages does Beacon actually work with?",
    a: "Auto-sync covers 20+ brokers through SnapTrade: Robinhood, Interactive Brokers, Vanguard US, Webull, E*TRADE, Wealthsimple, Public, tastytrade, Questrade, Moomoo, eToro, TD Direct Investing, DEGIRO, Trading212, AJ Bell, Zerodha, Upstox, CommSec, Stake, Bux, plus Coinbase, Kraken, and Binance for crypto. Fidelity and Schwab don't expose an open API, so for those we parse CSV exports. Same deal for anything else not on the list.",
  },
  {
    q: "Can Beacon see my password or place trades?",
    a: "No to both. Auto-sync uses OAuth, which means your credentials travel straight from your browser to your broker. Beacon never sees them. We also don't ask for trading permissions, so we couldn't buy, sell, or move money even if we wanted to.",
  },
  {
    q: "What does the Free plan actually include?",
    a: "One brokerage via CSV upload, the core holdings and dividend views, and basic allocation. No time limit, no credit card, and nothing crippled to the point of being useless.",
  },
  {
    q: "How accurate is the data?",
    a: "As accurate as what your brokers send us, which is usually good but not always perfect. We re-sync in the background and flag stale accounts. For anything that matters (taxes, sale decisions), always verify against the broker directly.",
  },
  {
    q: "How does Beacon make money?",
    a: "Subscriptions, period. Pro is $8/month and Elite is $15/month. We don't sell your data, we don't show ads, and we aren't an affiliate program in disguise.",
  },
  {
    q: "Is there a refund policy?",
    a: "Yes. 14-day full refund on any paid plan, no questions asked.",
  },
  {
    q: "Can I cancel anytime?",
    a: "One click in Settings. Your data stays exportable for 30 days in case you change your mind.",
  },
  {
    q: "What happens when I delete my account?",
    a: "Holdings, transactions, and brokerage connections go in the first pass (within 7 days). Backups clear within 30. Anonymized error logs stick around for 90 days so we can debug. Billing records are kept as long as tax law requires.",
  },
  {
    q: "Why should I trust a small app with this?",
    a: "Fair question. The short answer: we can't hold anything valuable. We can't trade, we can't send money, and we can't read your brokerage password. The worst case in a breach is someone seeing what stocks you own — less bad than what already leaks out of a typical email inbox.",
  },
];

/* ============================================================= Page shell */

export function PreviewLandingPage() {
  return (
    <div className="stripe-shell min-h-screen">
      <NavBar />
      <Hero />
      <TrustStrip />
      <Manifesto />
      <BeaconFlow />
      <FeatureGrid />
      <Differentiators />
      <SecurityBand />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------- Nav */

function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--stripe-hairline)] bg-white/85 backdrop-saturate-150">
      <div className="max-w-[1111px] mx-auto px-5 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-[var(--stripe-ink)]">
          <BeaconMark size={22} />
          <span className="font-display text-[15px]">{APP_NAME}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 text-sm text-[var(--stripe-ink-muted)]">
          {[
            { href: "#flow", label: "How it works" },
            { href: "#features", label: "Features" },
            { href: "#pricing", label: "Pricing" },
            { href: "#security", label: "Security" },
            { href: "#faq", label: "FAQ" },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="px-3 py-2 rounded-full hover:text-[var(--stripe-ink)] hover:bg-[var(--stripe-surface-sunk)] transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden sm:inline-flex items-center h-9 px-3 rounded-full text-sm text-[var(--stripe-ink-muted)] hover:text-[var(--stripe-ink)] transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="stripe-btn-primary inline-flex items-center gap-1.5 h-9 text-sm"
          >
            Get started
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ Hero */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Colorful mesh wash — the thing that fixes "bland" */}
      <div aria-hidden className="absolute inset-0 stripe-mesh stripe-mesh-angled" />
      {/* Subtle grid overlay for texture */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.25] stripe-mesh-angled"
        style={{
          backgroundImage:
            "linear-gradient(rgba(10,37,64,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(10,37,64,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative max-w-[1111px] mx-auto px-5 sm:px-6 pt-20 sm:pt-28 pb-32 sm:pb-40">
        <div className="max-w-[840px]">
          <div className="stripe-chip mb-6">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--stripe-accent)]" />
            Free forever for one brokerage
          </div>

          <h1 className="font-display font-bold tracking-[-0.03em] leading-[0.96] text-[clamp(44px,8.6vw,112px)] text-[var(--stripe-ink)]">
            Every brokerage.
            <br />
            <span className="stripe-gradient-text">One dashboard.</span>
          </h1>

          <p className="mt-6 max-w-[640px] text-[17px] sm:text-[19px] leading-[1.55] text-[var(--stripe-ink-muted)]">
            Beacon pulls your positions, dividends, and transactions from 20+ brokerages into one
            clean view. Robinhood, Vanguard, IBKR, Coinbase, and the long tail. Broker not on the list?
            Upload a CSV and we'll parse it.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/register"
              className="stripe-btn-primary inline-flex items-center gap-1.5 text-[15px]"
            >
              Start free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/login"
              className="stripe-btn-ghost inline-flex items-center gap-1.5 text-[15px]"
            >
              Try the demo
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[var(--stripe-ink-muted)]">
            <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[var(--stripe-accent)]" /> No credit card</span>
            <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[var(--stripe-accent)]" /> Read-only access</span>
            <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[var(--stripe-accent)]" /> Cancel anytime</span>
          </div>
        </div>

        {/* Hero product card — Stripe's signature floating card */}
        <HeroPreviewCard />
      </div>
    </section>
  );
}

function HeroPreviewCard() {
  return (
    <div className="mt-16 sm:mt-24 relative">
      <div className="relative mx-auto max-w-[980px]">
        {/* Floating glow under card */}
        <div
          aria-hidden
          className="absolute -inset-x-10 -inset-y-4 opacity-70 pointer-events-none"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 50%, rgba(99,91,255,0.25), transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div className="relative stripe-card overflow-hidden">
          {/* Faux browser chrome */}
          <div className="flex items-center gap-1.5 px-4 h-10 border-b border-[var(--stripe-hairline)] bg-[var(--stripe-surface-sunk)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5996]/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffcc55]/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#11efe3]/80" />
            <div className="flex-1 text-center text-[11px] font-mono text-[var(--stripe-ink-muted)]">
              app.beacon.finance/overview
            </div>
          </div>
          {/* Card body — mini dashboard mock */}
          <div className="p-5 sm:p-8 grid md:grid-cols-3 gap-5">
            <MiniStat label="Portfolio value" value="$248,914" delta="+ 2.14%" positive />
            <MiniStat label="Today" value="+ $5,321" delta="+ 2.14%" positive />
            <MiniStat label="12-mo dividends" value="$6,482" delta="forecast" muted />
            <div className="md:col-span-3 rounded-2xl border border-[var(--stripe-hairline)] bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] font-semibold text-[var(--stripe-ink)]">Holdings</div>
                <div className="text-[11px] text-[var(--stripe-ink-muted)] font-mono uppercase tracking-widest">42 positions</div>
              </div>
              <div className="space-y-2">
                {[
                  { t: "NVDA", n: "NVIDIA Corporation", v: "$38,440", d: "+ 3.21%", pos: true },
                  { t: "AAPL", n: "Apple Inc.", v: "$22,108", d: "+ 0.64%", pos: true },
                  { t: "VOO",  n: "Vanguard S&P 500 ETF", v: "$31,880", d: "+ 0.42%", pos: true },
                  { t: "TSLA", n: "Tesla Inc.", v: "$14,520", d: "− 1.18%", pos: false },
                ].map((r) => (
                  <div key={r.t} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--stripe-surface-sunk)] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[var(--stripe-surface-sunk)] font-mono text-[11px] font-semibold text-[var(--stripe-ink)] flex items-center justify-center">
                        {r.t}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-[var(--stripe-ink)]">{r.n}</div>
                        <div className="text-[11px] text-[var(--stripe-ink-muted)] font-mono">{r.t} · NYSE</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-medium text-[var(--stripe-ink)] font-mono">{r.v}</div>
                      <div className={`text-[11px] font-mono ${r.pos ? "text-emerald-600" : "text-[#ff5996]"}`}>{r.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label, value, delta, positive, muted,
}: {
  label: string;
  value: string;
  delta: string;
  positive?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--stripe-hairline)] bg-white p-5">
      <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-ink-muted)]">{label}</div>
      <div className="mt-2 font-display text-2xl sm:text-3xl text-[var(--stripe-ink)] tracking-tight">{value}</div>
      <div className={`mt-1 text-[12px] font-mono ${
        muted ? "text-[var(--stripe-ink-muted)]" : positive ? "text-emerald-600" : "text-[#ff5996]"
      }`}>{delta}</div>
    </div>
  );
}

/* ------------------------------------------------------------- Trust strip */

function TrustStrip() {
  const items = [
    { label: "brokerages auto-sync", value: "20+" },
    { label: "setup time",           value: "< 5 min" },
    { label: "read-only access",     value: "100%" },
    { label: "forever for 1 broker", value: "Free" },
  ];
  return (
    <section className="border-y border-[var(--stripe-hairline)] bg-[var(--stripe-surface-sunk)]">
      <div className="max-w-[1111px] mx-auto px-5 sm:px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
        {items.map((it) => (
          <div key={it.label} className="text-center">
            <div className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[var(--stripe-ink)]">{it.value}</div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-ink-muted)] mt-1">{it.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Manifesto */

function Manifesto() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="manifesto" className="py-24 sm:py-32">
      <div ref={ref} className="reveal max-w-[1111px] mx-auto px-5 sm:px-6">
        <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-accent)] mb-4">
          Why Beacon
        </div>
        <h2 className="font-display text-4xl sm:text-[62px] font-bold tracking-[-0.02em] leading-[1.04] text-[var(--stripe-ink)] max-w-[900px]">
          Your money is spread across half a dozen apps. <span className="text-[var(--stripe-ink-muted)]">It shouldn't feel that way.</span>
        </h2>
        <div className="mt-8 grid md:grid-cols-3 gap-6 md:gap-12 max-w-[1000px]">
          <p className="text-[15px] leading-[1.65] text-[var(--stripe-ink-muted)]">
            We built Beacon because we were tired of logging into six brokerage apps to answer one question: <span className="text-[var(--stripe-ink)] font-medium">what do I actually own?</span>
          </p>
          <p className="text-[15px] leading-[1.65] text-[var(--stripe-ink-muted)]">
            Mint shut down. Personal Capital got swallowed. Snowball wants $10/month for a pie chart. The spreadsheet you keep promising to update hasn't been touched since March.
          </p>
          <p className="text-[15px] leading-[1.65] text-[var(--stripe-ink-muted)]">
            Beacon is the thing we wanted. One place for your positions, dividends, and transactions. Read-only. Cheap enough you never have to wonder whether it's worth the cost.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- Beacon flow */

function BeaconFlow() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="flow" className="py-24 sm:py-32 bg-[var(--stripe-surface-sunk)] border-y border-[var(--stripe-hairline)]">
      <div className="max-w-[1111px] mx-auto px-5 sm:px-6">
        <div ref={ref} className="reveal text-center mb-12">
          <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-accent)] mb-3">
            Beacon flow
          </div>
          <h2 className="font-display text-3xl sm:text-[56px] font-bold tracking-[-0.02em] leading-[1.04] text-[var(--stripe-ink)] max-w-[900px] mx-auto">
            Five steps. One portfolio.
          </h2>
          <p className="mt-4 max-w-[560px] mx-auto text-[15px] text-[var(--stripe-ink-muted)]">
            Hover or tap a node to see what happens at that stage. Nothing to memorize — the orbit just walks through it.
          </p>
        </div>
        <RadialOrbitalTimeline timelineData={timelineData} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Feature grid */

function FeatureGrid() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="max-w-[1111px] mx-auto px-5 sm:px-6">
        <div ref={ref} className="reveal mb-14 max-w-[780px]">
          <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-accent)] mb-3">
            Features
          </div>
          <h2 className="font-display text-3xl sm:text-[56px] font-bold tracking-[-0.02em] leading-[1.04] text-[var(--stripe-ink)]">
            The obvious stuff. <span className="text-[var(--stripe-ink-muted)]">Plus the bits other trackers never got around to.</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {features.map((f, i) => (
            <FeatureCard key={f.title} feature={f} delay={i * 60} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  feature, delay,
}: {
  feature: typeof features[number];
  delay: number;
}) {
  const ref = useReveal<HTMLDivElement>();
  const Icon = feature.icon;
  return (
    <div ref={ref} className="reveal" style={{ transitionDelay: `${delay}ms` }}>
      <div className="stripe-card p-6 h-full flex flex-col">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
          style={{
            background: `linear-gradient(135deg, ${feature.accent}22, ${feature.accent}11)`,
            color: feature.accent,
            boxShadow: `inset 0 0 0 1px ${feature.accent}30`,
          }}
        >
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="font-display text-[17px] font-bold tracking-tight text-[var(--stripe-ink)] mb-2">
          {feature.title}
        </h3>
        <p className="text-[14px] leading-[1.55] text-[var(--stripe-ink-muted)]">
          {feature.body}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- Differentiators */

function Differentiators() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="py-24 sm:py-32 bg-[var(--stripe-surface-sunk)] border-y border-[var(--stripe-hairline)]">
      <div className="max-w-[1111px] mx-auto px-5 sm:px-6">
        <div ref={ref} className="reveal max-w-[900px] mb-12">
          <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-accent)] mb-3">
            What makes Beacon different
          </div>
          <h2 className="font-display text-3xl sm:text-[56px] font-bold tracking-[-0.02em] leading-[1.04] text-[var(--stripe-ink)]">
            Built for people who actually own more than one brokerage.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {differentiators.map((d) => (
            <DiffCard key={d.title} item={d} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DiffCard({ item }: { item: typeof differentiators[number] }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="reveal">
      <div className="stripe-card p-6 sm:p-7 h-full flex gap-4">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white"
          style={{ background: "var(--stripe-accent)" }}
        >
          <Check className="w-4 h-4" strokeWidth={2.5} />
        </div>
        <div>
          <h3 className="font-display text-[17px] font-bold tracking-tight text-[var(--stripe-ink)] mb-1.5">
            {item.title}
          </h3>
          <p className="text-[14px] leading-[1.55] text-[var(--stripe-ink-muted)]">
            {item.body}
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Security */

function SecurityBand() {
  const ref = useReveal<HTMLDivElement>();
  const points = [
    { icon: Eye,          title: "Read-only access",   body: "We can read your positions and history. We can't place trades or move money — we never asked for that permission." },
    { icon: Lock,         title: "Never your password", body: "OAuth via SnapTrade or Plaid. Your brokerage credentials skip our servers entirely." },
    { icon: ShieldCheck,  title: "Bank-grade encryption", body: "TLS 1.3 in transit. AES-256 at rest. Bcrypt for passwords, so nobody at Beacon can read yours." },
    { icon: CreditCard,   title: "Your data, portable", body: "One-click CSV export, and a delete button that actually empties the drawer." },
  ];
  return (
    <section id="security" className="py-24 sm:py-32">
      <div ref={ref} className="reveal max-w-[1111px] mx-auto px-5 sm:px-6 grid lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-16 items-start">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-accent)] mb-3">
            Security
          </div>
          <h2 className="font-display text-3xl sm:text-[56px] font-bold tracking-[-0.02em] leading-[1.04] text-[var(--stripe-ink)]">
            Your money is your business.
            <br />
            <span className="text-[var(--stripe-ink-muted)]">Your data is too.</span>
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-[1.65] text-[var(--stripe-ink-muted)]">
            Beacon is built to the same standards as the brokerages it connects to. In practice we hold strictly less than they do: no passwords, no trading rights, and a one-click delete that actually empties the drawer.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {points.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="stripe-card p-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{
                      background: "var(--stripe-accent-soft)",
                      color: "var(--stripe-accent-strong)",
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <h4 className="font-display text-[14px] font-bold tracking-tight text-[var(--stripe-ink)]">
                    {p.title}
                  </h4>
                </div>
                <p className="text-[13.5px] leading-[1.55] text-[var(--stripe-ink-muted)]">{p.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Pricing */

function Pricing() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="pricing" className="py-24 sm:py-32 bg-[var(--stripe-surface-sunk)] border-y border-[var(--stripe-hairline)]">
      <div className="max-w-[1111px] mx-auto px-5 sm:px-6">
        <div ref={ref} className="reveal text-center mb-14 max-w-[640px] mx-auto">
          <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-accent)] mb-3">
            Pricing
          </div>
          <h2 className="font-display text-3xl sm:text-[56px] font-bold tracking-[-0.02em] leading-[1.04] text-[var(--stripe-ink)]">
            Start free. Upgrade when you outgrow it.
          </h2>
          <p className="mt-4 text-[15px] text-[var(--stripe-ink-muted)]">
            No surprise fees. Cancel anytime. 14-day refund window on every paid plan.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {pricingTiers.map((tier, i) => (
            <PricingCard key={tier.name} tier={tier} delay={i * 80} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingCard({
  tier, delay,
}: {
  tier: typeof pricingTiers[number];
  delay: number;
}) {
  const ref = useReveal<HTMLDivElement>();
  const { comingSoon, accent } = tier;
  return (
    <div ref={ref} className="reveal relative" style={{ transitionDelay: `${delay}ms` }}>
      <div
        className={`relative h-full rounded-2xl p-7 sm:p-8 ${
          accent ? "bg-white stripe-gradient-border shadow-[0_24px_48px_-20px_rgba(99,91,255,0.35)]" : "stripe-card"
        } ${comingSoon ? "grayscale opacity-70" : accent ? "" : ""}`}
      >
        {tier.badge && !comingSoon && (
          <div
            className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.18em] font-mono font-semibold px-3 py-1 rounded-full text-white"
            style={{ background: "var(--stripe-accent)" }}
          >
            {tier.badge}
          </div>
        )}

        <div className="text-[13px] font-display font-bold tracking-tight text-[var(--stripe-ink)]">{tier.name}</div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-display text-[44px] sm:text-[52px] font-bold tracking-tight text-[var(--stripe-ink)]">
            {tier.price}
          </span>
          <span className="text-[13px] text-[var(--stripe-ink-muted)]">{tier.cadence}</span>
        </div>
        {tier.annual && (
          <div className="mt-1 text-[12px] font-mono text-[var(--stripe-ink-muted)]">{tier.annual}</div>
        )}
        <p className="mt-4 text-[14px] leading-[1.5] text-[var(--stripe-ink-muted)] min-h-[40px]">{tier.blurb}</p>

        {comingSoon ? (
          <button
            disabled
            aria-disabled="true"
            className="mt-6 w-full inline-flex items-center justify-center gap-2 h-11 rounded-full border border-[var(--stripe-hairline)] text-[var(--stripe-ink-muted)] cursor-not-allowed text-[13px]"
          >
            <X className="w-3.5 h-3.5" />
            {tier.cta}
          </button>
        ) : (
          <Link
            to="/register"
            className={`mt-6 w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-full text-[13px] font-medium transition-all ${
              accent ? "stripe-btn-primary" : "stripe-btn-ghost"
            }`}
          >
            {tier.cta}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}

        <div className="mt-6 h-px bg-[var(--stripe-hairline)]" />

        <ul className="mt-5 space-y-2.5 text-[13.5px] text-[var(--stripe-ink-muted)]">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <Check className="w-4 h-4 mt-0.5 text-[var(--stripe-accent)] flex-shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Coming-soon overlay for Elite */}
      {comingSoon && (
        <div className="absolute inset-0 rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 rounded-2xl bg-[var(--stripe-surface-sunk)]/70" />
          <div className="absolute inset-0 rounded-2xl border border-[var(--stripe-hairline)]" />
          <div className="relative flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[var(--stripe-hairline)] text-[var(--stripe-ink)] text-[12px] font-mono font-semibold tracking-wide shadow-md">
            <X className="w-3.5 h-3.5" strokeWidth={2.5} />
            Coming soon
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ FAQ */

function Faq() {
  const ref = useReveal<HTMLDivElement>();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-24 sm:py-32">
      <div className="max-w-[880px] mx-auto px-5 sm:px-6">
        <div ref={ref} className="reveal text-center mb-12">
          <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-accent)] mb-3">
            FAQ
          </div>
          <h2 className="font-display text-3xl sm:text-[56px] font-bold tracking-[-0.02em] leading-[1.04] text-[var(--stripe-ink)]">
            Questions people actually ask.
          </h2>
          <p className="mt-4 text-[15px] text-[var(--stripe-ink-muted)]">
            Straight answers. If something's missing, email us and we'll add it.
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-[var(--stripe-hairline)] divide-y divide-[var(--stripe-hairline)] overflow-hidden">
          {faqItems.map((item, i) => (
            <FaqRow
              key={i}
              item={item}
              isOpen={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqRow({
  item, isOpen, onToggle,
}: {
  item: { q: string; a: string };
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-4 text-left px-5 sm:px-7 py-5 hover:bg-[var(--stripe-surface-sunk)] transition-colors group"
      >
        <span className="text-[15px] font-medium text-[var(--stripe-ink)]">{item.q}</span>
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-full border border-[var(--stripe-hairline)] flex items-center justify-center text-[var(--stripe-ink-muted)] transition-transform duration-300 ${
            isOpen ? "rotate-45 bg-[var(--stripe-accent)] text-white border-[var(--stripe-accent)]" : "group-hover:border-[var(--stripe-ink-muted)]"
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-5 sm:px-7 pb-5 text-[14px] leading-[1.65] text-[var(--stripe-ink-muted)]">
            {item.a}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Final CTA */

function FinalCta() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="py-16 sm:py-24">
      <div ref={ref} className="reveal max-w-[1111px] mx-auto px-5 sm:px-6">
        <div className="relative overflow-hidden rounded-[28px] stripe-mesh-dark text-white">
          <div className="relative px-8 sm:px-16 py-16 sm:py-24 text-center">
            <h2 className="font-display text-3xl sm:text-[64px] font-bold tracking-[-0.02em] leading-[1.04]">
              Start tracking your whole portfolio.
              <br />
              <span className="opacity-70">In under five minutes.</span>
            </h2>
            <p className="mt-5 text-[15px] sm:text-[17px] text-white/75 max-w-[560px] mx-auto">
              Free forever for one brokerage. No credit card, no trial-to-paid gotcha, and nobody's reselling your holdings to a data broker.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-1.5 rounded-full bg-white text-[var(--stripe-ink)] font-medium px-5 h-11 text-[14px] hover:bg-white/90 transition-colors"
              >
                Get started free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/30 text-white font-medium px-5 h-11 text-[14px] hover:bg-white/10 transition-colors"
              >
                Try the demo
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Footer */

function Footer() {
  return (
    <footer className="border-t border-[var(--stripe-hairline)] bg-[var(--stripe-surface-sunk)]">
      <div className="max-w-[1111px] mx-auto px-5 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-[var(--stripe-ink-muted)]">
        <div className="flex items-center gap-2">
          <BeaconMark size={18} />
          <span className="font-display font-semibold text-[var(--stripe-ink)]">{APP_NAME}</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <a href="#manifesto" className="hover:text-[var(--stripe-ink)] transition-colors">Why Beacon</a>
          <a href="#features" className="hover:text-[var(--stripe-ink)] transition-colors">Features</a>
          <a href="#pricing" className="hover:text-[var(--stripe-ink)] transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-[var(--stripe-ink)] transition-colors">FAQ</a>
          <a
            href="https://beacon-three-liard.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-[var(--stripe-ink)] transition-colors"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Status
          </a>
          <Link to="/terms" className="hover:text-[var(--stripe-ink)] transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-[var(--stripe-ink)] transition-colors">Privacy</Link>
          <Link to="/login" className="hover:text-[var(--stripe-ink)] transition-colors">Sign in</Link>
        </div>
      </div>
      <div className="max-w-[1111px] mx-auto px-5 sm:px-6 pb-8 text-[11px] text-[var(--stripe-ink-muted)]/90 text-center sm:text-left">
        Beacon is a portfolio tracking tool, not a registered broker-dealer or investment advisor.
        Nothing here is financial advice. <Bell className="inline w-3 h-3 align-[-2px]" /> Price alerts,
        dividend forecasts, and allocation drift are informational.
      </div>
    </footer>
  );
}
