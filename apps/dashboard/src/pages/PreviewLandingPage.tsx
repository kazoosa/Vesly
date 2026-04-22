import {
  UserPlus, Link2, LayoutDashboard, Coins, Scale,
  ShieldCheck, Upload, PieChart, LineChart, Bell, RefreshCw,
  Lock, Eye, CreditCard, ArrowUpRight, ArrowRight, Check, Plus, X,
  TrendingUp, Menu,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import RadialOrbitalTimeline, { type TimelineItem } from "../components/ui/radial-orbital-timeline";
import { useReveal } from "../lib/useReveal";
import { BeaconMark } from "../components/BeaconMark";
import { APP_NAME } from "../lib/brand";
import { BrokerMarquee as BrokerMarqueeRow } from "../components/BrokerMarquee";

/* ==========================================================================
   Launch page — refined, quiet, physical.
   Single violet accent (#635bff). Soft corner wash only.
   Proper sans display type. 3D floating card stack in the hero.
   Broker logo marquee for trust.
   ========================================================================== */

/* ------------------------------------------------------------------ Data */

const timelineData: TimelineItem[] = [
  { id: 1, title: "Sign up",            date: "30 seconds", content: "Email and a password. No credit card, no phone number, no 10-screen onboarding quiz. You're in before a support chat could load.", category: "Start",    icon: UserPlus },
  { id: 2, title: "Connect brokerage",  date: "~2 minutes", content: "Auto-sync with 20+ brokerages via read-only OAuth, or drop in a CSV. Your brokerage password never reaches us.",               category: "Connect",  icon: Link2 },
  { id: 3, title: "See holdings",       date: "Instant",    content: "A single view across every account you've connected. Deduped by ticker, sortable by whatever you care about, and you can expand any row to see which accounts hold it.", category: "View", icon: LayoutDashboard },
  { id: 4, title: "Track dividends",    date: "Automatic",  content: "YTD totals, a monthly bar chart, your top payers, and a forward 12-month forecast. So you know what's coming in, not just what already did.",              category: "Income",   icon: Coins },
  { id: 5, title: "Rebalance",          date: "Any time",   content: "Allocation drift by security, by brokerage, by asset class. Beacon shows you what's overweight and by how much.",              category: "Optimize", icon: Scale },
];

const features = [
  { icon: LayoutDashboard, title: "Unified holdings",       body: "Every share you own, across every broker you've connected, in one table. Sort, filter, download." },
  { icon: RefreshCw,       title: "Always in sync",         body: "Background refresh keeps your numbers up to date. Connect once and retire the spreadsheet." },
  { icon: Coins,           title: "Dividend intelligence",  body: "Monthly income, YTD totals, forward 12-month forecast, and who your biggest payers actually are." },
  { icon: PieChart,        title: "Allocation breakdown",   body: "Three views: by security, by brokerage, by asset class. Real concentration, surfaced." },
  { icon: LineChart,       title: "Performance tracking",   body: "Day, YTD, and total return. Benchmark against the S&P 500 or pick your own index." },
  { icon: Upload,          title: "CSV fallback",           body: "Broker not supported yet? Export a CSV and we'll parse it. Every major format, most of the weirder ones too." },
];

const differentiators = [
  { title: "Every brokerage, not just the US big three",       body: "Robinhood, IBKR, Vanguard, Wealthsimple, Questrade, DEGIRO, Trading212, Moomoo, eToro, plus Coinbase, Kraken, and Binance. Twenty-plus out of the box." },
  { title: "Read-only. Always. We never hold your keys.",      body: "Auto-sync goes through SnapTrade (and Plaid, for some plans) via OAuth. Your brokerage password never reaches us. We also don't ask for trading permissions." },
  { title: "Not a dashboard for apps that already died",       body: "Mint shut down. Personal Capital got pivoted. Snowball charges you for a pie chart. Beacon is small, affordable, and not trying to sell to anyone." },
  { title: "You own your data, and can take it with you",      body: "One-click CSV export of everything. One-click account deletion that actually deletes. No dark patterns." },
];

const pricingTiers: {
  name: string; price: string; cadence: string; annual?: string;
  blurb: string; features: string[]; cta: string;
  accent?: boolean; badge?: string; comingSoon?: boolean;
}[] = [
  {
    name: "Free", price: "$0", cadence: "forever",
    blurb: "For trying Beacon on one account.",
    features: ["1 brokerage via CSV upload", "Holdings and dividends views", "Basic allocation breakdown", "Light and dark themes", "No credit card required"],
    cta: "Get started",
  },
  {
    name: "Pro", price: "$8", cadence: "per month", annual: "or $69 / year",
    blurb: "For investors with real portfolios across multiple accounts.",
    features: ["Unlimited brokerages (auto-sync)", "Dividend forecast and calendar", "Watchlist and price alerts", "Capital gains report", "Sector and geography allocation", "Performance vs S&P 500", "Read-only share link", "CSV export", "Email support"],
    cta: "Start Pro", accent: true, badge: "Most popular",
  },
  {
    name: "Elite", price: "$15", cadence: "per month", annual: "or $129 / year",
    blurb: "For people who want AI-powered portfolio analysis.",
    features: ["Everything in Pro", "AI portfolio analysis", "AI rebalance recommendations", "Monthly AI portfolio letter", "Natural-language queries", "Tax-loss harvesting plan", "Wash-sale detection", "Custom benchmarks", "Priority support"],
    cta: "Coming soon", comingSoon: true,
  },
];

const faqItems: { q: string; a: string }[] = [
  { q: "Which brokerages does Beacon actually work with?",       a: "Auto-sync covers 20+ brokers through SnapTrade: Robinhood, Interactive Brokers, Vanguard US, Webull, E*TRADE, Wealthsimple, Public, tastytrade, Questrade, Moomoo, eToro, TD Direct Investing, DEGIRO, Trading212, AJ Bell, Zerodha, Upstox, CommSec, Stake, Bux, plus Coinbase, Kraken, and Binance for crypto. Fidelity and Schwab don't expose an open API, so for those we parse CSV exports. Same deal for anything else not on the list." },
  { q: "Can Beacon see my password or place trades?",             a: "No to both. Auto-sync uses OAuth, which means your credentials travel straight from your browser to your broker. Beacon never sees them. We also don't ask for trading permissions, so we couldn't buy, sell, or move money even if we wanted to." },
  { q: "What does the Free plan actually include?",               a: "One brokerage via CSV upload, the core holdings and dividend views, and basic allocation. No time limit, no credit card, and nothing crippled to the point of being useless." },
  { q: "How accurate is the data?",                               a: "As accurate as what your brokers send us, which is usually good but not always perfect. We re-sync in the background and flag stale accounts. For anything that matters (taxes, sale decisions), always verify against the broker directly." },
  { q: "How does Beacon make money?",                             a: "Subscriptions, period. Pro is $8/month and Elite is $15/month. We don't sell your data, we don't show ads, and we aren't an affiliate program in disguise." },
  { q: "Is there a refund policy?",                               a: "Yes. 14-day full refund on any paid plan, no questions asked." },
  { q: "Can I cancel anytime?",                                   a: "One click in Settings. Your data stays exportable for 30 days in case you change your mind." },
  { q: "What happens when I delete my account?",                  a: "Holdings, transactions, and brokerage connections go in the first pass (within 7 days). Backups clear within 30. Anonymized error logs stick around for 90 days so we can debug. Billing records are kept as long as tax law requires." },
  { q: "Why should I trust a small app with this?",               a: "Fair question. The short answer: we can't hold anything valuable. We can't trade, we can't send money, and we can't read your brokerage password. The worst case in a breach is someone seeing what stocks you own — less bad than what already leaks out of a typical email inbox." },
];

/* ============================================================= Page shell */

export function PreviewLandingPage() {
  // Warm up the backend the moment someone lands, so that by the time they
  // click "Try the demo" the Koyeb free instance is already out of its
  // cold-start penalty. Fire-and-forget, ~1KB response.
  useEffect(() => {
    const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
    if (!API) return;
    const ctrl = new AbortController();
    fetch(`${API}/health`, { signal: ctrl.signal }).catch(() => { /* ignore */ });
    return () => ctrl.abort();
  }, []);

  return (
    <div className="stripe-shell min-h-screen">
      <NavBar />
      <Hero />
      <BrokerMarquee />
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
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#flow",     label: "How it works" },
    { href: "#features", label: "Features" },
    { href: "#pricing",  label: "Pricing" },
    { href: "#security", label: "Security" },
    { href: "#faq",      label: "FAQ" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--stripe-hairline)] bg-white/90">
      <div className="max-w-[1111px] mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-[var(--stripe-ink)]">
          <BeaconMark size={22} />
          <span className="font-semibold tracking-tight text-[15px]">{APP_NAME}</span>
        </Link>

        {/* Desktop links */}
        <nav className="hidden md:flex items-center gap-1 text-[14px] text-[var(--stripe-ink-muted)]">
          {links.map((l) => (
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
          <Link to="/login" className="hidden sm:inline-flex items-center h-9 px-3 rounded-full text-[14px] text-[var(--stripe-ink-muted)] hover:text-[var(--stripe-ink)] transition-colors">
            Sign in
          </Link>
          <Link to="/register" className="stripe-btn-primary inline-flex items-center gap-1.5 h-9 text-[14px]">
            Get started
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-full border border-[var(--stripe-hairline)] text-[var(--stripe-ink-muted)] hover:text-[var(--stripe-ink)] hover:border-[var(--stripe-hairline-strong)] transition-colors"
          >
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      <div
        className={`md:hidden overflow-hidden border-t border-[var(--stripe-hairline)] transition-[max-height] duration-300 ease-out ${
          open ? "max-h-[320px]" : "max-h-0"
        }`}
      >
        <nav className="px-6 py-3 flex flex-col">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="py-2.5 text-[15px] text-[var(--stripe-ink-muted)] hover:text-[var(--stripe-ink)] transition-colors"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/login"
            onClick={() => setOpen(false)}
            className="py-2.5 text-[15px] text-[var(--stripe-ink-muted)] hover:text-[var(--stripe-ink)] transition-colors border-t border-[var(--stripe-hairline)] mt-2 pt-3"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ Hero */

function Hero() {
  return (
    <section className="relative overflow-hidden stripe-hero-bg">
      <div className="relative max-w-[1111px] mx-auto px-6 pt-16 sm:pt-24 pb-20 sm:pb-28 grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16 items-center">
        {/* Left — copy */}
        <div>
          <div className="stripe-chip mb-6">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--stripe-accent)]" />
            Free forever for 1 brokerage
          </div>

          <h1 className="text-[44px] sm:text-[64px] lg:text-[76px] font-bold tracking-[-0.03em] leading-[1.02] text-[var(--stripe-ink)]">
            Every brokerage.
            <br />
            <span className="text-[var(--stripe-ink-muted)]">One dashboard.</span>
          </h1>

          <p className="mt-6 max-w-[560px] text-[17px] leading-[1.55] text-[var(--stripe-ink-muted)]">
            Beacon pulls in your holdings, dividends, and transactions from whatever brokerages you
            already use. Robinhood, Vanguard, IBKR, Coinbase, and about twenty more. Missing one?
            Upload a CSV and we'll parse it.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/register" className="stripe-btn-primary inline-flex items-center gap-1.5 text-[15px]">
              Start free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/demo" className="stripe-btn-ghost inline-flex items-center gap-1.5 text-[15px]">
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

        {/* Right — 3D card stack */}
        <HeroStack />
      </div>
    </section>
  );
}

/**
 * 3D floating card stack. A main holdings card tilts in perspective;
 * two secondary cards (dividend, allocation) float around it with
 * slightly different angles and independent drift animations.
 * All shadows are real — no filter:blur, no fake depth tricks.
 */
function HeroStack() {
  return (
    <div className="relative stripe-stage">
      {/* Soft violet glow bed */}
      <div
        aria-hidden
        className="absolute -inset-10 opacity-70 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 50%, rgba(99, 91, 255, 0.18), transparent 70%)",
        }}
      />

      <div className="relative stripe-stack w-full" style={{ aspectRatio: "5 / 6" }}>
        {/* Main card: holdings */}
        <div
          className="stripe-stack-card stripe-float-a"
          style={{
            inset: "6% 8% 18% 4%",
            transform: "rotateY(-8deg) rotateX(4deg) translateZ(0)",
            ["--rx" as never]: "4deg",
            ["--ry" as never]: "-8deg",
            padding: "18px 18px 14px",
          }}
        >
          <HoldingsMock />
        </div>

        {/* Secondary: dividend forecast, top-right, pushed forward */}
        <div
          className="stripe-stack-card stripe-float-b"
          style={{
            top: "-2%",
            right: "-4%",
            width: "52%",
            transform: "rotateY(-12deg) rotateX(6deg) translateZ(60px)",
            ["--rx" as never]: "6deg",
            ["--ry" as never]: "-12deg",
            padding: "14px 14px 12px",
          }}
        >
          <DividendMock />
        </div>

        {/* Secondary: allocation donut, bottom-left, pushed forward */}
        <div
          className="stripe-stack-card stripe-float-a"
          style={{
            bottom: "0%",
            left: "-6%",
            width: "46%",
            transform: "rotateY(-4deg) rotateX(-2deg) translateZ(90px)",
            ["--rx" as never]: "-2deg",
            ["--ry" as never]: "-4deg",
            padding: "14px",
            animationDelay: "1.2s",
          }}
        >
          <AllocationMock />
        </div>
      </div>
    </div>
  );
}

function HoldingsMock() {
  const rows = [
    { t: "NVDA", n: "NVIDIA Corporation",     v: "$38,440", d: "+3.21%", pos: true  },
    { t: "AAPL", n: "Apple Inc.",             v: "$22,108", d: "+0.64%", pos: true  },
    { t: "VOO",  n: "Vanguard S&P 500 ETF",   v: "$31,880", d: "+0.42%", pos: true  },
    { t: "TSLA", n: "Tesla Inc.",             v: "$14,520", d: "−1.18%", pos: false },
    { t: "BTC",  n: "Bitcoin",                v: "$18,201", d: "+2.08%", pos: true  },
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] font-semibold text-[var(--stripe-ink)]">Holdings</div>
        <div className="text-[10px] text-[var(--stripe-ink-faint)] font-mono uppercase tracking-[0.12em]">42 positions</div>
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.t} className="flex items-center justify-between py-1.5 px-2 rounded-lg">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-[var(--stripe-surface-sunk)] border border-[var(--stripe-hairline)] font-mono text-[10px] font-semibold text-[var(--stripe-ink)] flex items-center justify-center">
                {r.t}
              </div>
              <div className="leading-tight">
                <div className="text-[11px] font-medium text-[var(--stripe-ink)]">{r.n}</div>
                <div className="text-[9px] text-[var(--stripe-ink-faint)] font-mono">{r.t} · NYSE</div>
              </div>
            </div>
            <div className="text-right leading-tight">
              <div className="text-[11px] font-medium text-[var(--stripe-ink)] font-mono tabular-nums">{r.v}</div>
              <div className={`text-[9px] font-mono tabular-nums ${r.pos ? "text-emerald-600" : "text-rose-500"}`}>{r.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DividendMock() {
  const bars = [30, 42, 38, 55, 47, 62, 58, 68, 72, 65, 78, 84];
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold text-[var(--stripe-ink)]">12-mo forecast</div>
        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
      </div>
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-[22px] font-bold tracking-tight text-[var(--stripe-ink)]">$6,482</span>
        <span className="text-[10px] text-emerald-600 font-mono">+12.4%</span>
      </div>
      <div className="flex items-end gap-1 h-14">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: `${h}%`,
              background:
                i >= bars.length - 4
                  ? "linear-gradient(180deg, #8579ff, #635bff)"
                  : "rgba(99, 91, 255, 0.18)",
            }}
          />
        ))}
      </div>
      <div className="mt-2 text-[9px] text-[var(--stripe-ink-faint)] font-mono uppercase tracking-[0.14em]">
        Jan ——— Dec
      </div>
    </div>
  );
}

function AllocationMock() {
  // Simple conic-gradient donut
  const segments = [
    { label: "Tech",       pct: 42, color: "#635bff" },
    { label: "ETFs",       pct: 28, color: "#8579ff" },
    { label: "Crypto",     pct: 14, color: "#b0a6ff" },
    { label: "Healthcare", pct: 10, color: "#d6d1ff" },
    { label: "Cash",       pct:  6, color: "#ebe8ff" },
  ];
  // Compute conic stops
  let acc = 0;
  const stops = segments.map((s) => {
    const from = acc; acc += s.pct;
    return `${s.color} ${from}% ${acc}%`;
  }).join(", ");
  return (
    <div>
      <div className="text-[11px] font-semibold text-[var(--stripe-ink)] mb-2">Allocation</div>
      <div className="flex items-center gap-3">
        <div
          className="relative flex-shrink-0 w-16 h-16 rounded-full"
          style={{ background: `conic-gradient(${stops})` }}
        >
          <div className="absolute inset-1.5 rounded-full bg-white" />
        </div>
        <div className="space-y-1 flex-1 min-w-0">
          {segments.slice(0, 4).map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="flex items-center gap-1.5 text-[var(--stripe-ink-muted)]">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-mono tabular-nums text-[var(--stripe-ink)]">{s.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- Broker marquee */

function BrokerMarquee() {
  return (
    <section className="py-10 border-y border-[var(--stripe-hairline)] bg-white">
      <div className="max-w-[1111px] mx-auto px-6">
        <div className="text-center text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-ink-faint)] mb-6">
          Works with
        </div>
        <BrokerMarqueeRow />
        <div className="mt-6 text-center text-[12px] text-[var(--stripe-ink-muted)]">
          Plus anything with a CSV export. Drag the row to scroll.
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Manifesto */

function Manifesto() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="manifesto" className="py-24 sm:py-32">
      <div ref={ref} className="reveal max-w-[1111px] mx-auto px-6">
        <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-ink-faint)] mb-4">
          Why Beacon
        </div>
        <h2 className="text-[34px] sm:text-[52px] font-bold tracking-[-0.02em] leading-[1.06] text-[var(--stripe-ink)] max-w-[900px]">
          Your money is spread across half a dozen apps.{" "}
          <span className="text-[var(--stripe-ink-muted)]">It shouldn't feel that way.</span>
        </h2>
        <div className="mt-10 grid md:grid-cols-3 gap-6 md:gap-12 max-w-[1000px]">
          <p className="text-[15px] leading-[1.65] text-[var(--stripe-ink-muted)]">
            We built Beacon because we were tired of logging into six brokerage apps to answer one
            question: <span className="text-[var(--stripe-ink)] font-medium">what do I actually own?</span>
          </p>
          <p className="text-[15px] leading-[1.65] text-[var(--stripe-ink-muted)]">
            Mint shut down. Personal Capital got swallowed. Snowball wants $10/month for a pie chart.
            The spreadsheet you keep promising to update hasn't been touched since March.
          </p>
          <p className="text-[15px] leading-[1.65] text-[var(--stripe-ink-muted)]">
            Beacon is the thing we wanted. One place for your positions, dividends, and transactions.
            Read-only. Cheap enough you never have to wonder whether it's worth the cost.
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
      <div className="max-w-[1111px] mx-auto px-6">
        <div ref={ref} className="reveal text-center mb-12">
          <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-ink-faint)] mb-3">
            Beacon flow
          </div>
          <h2 className="text-[34px] sm:text-[52px] font-bold tracking-[-0.02em] leading-[1.06] text-[var(--stripe-ink)] max-w-[900px] mx-auto">
            Five steps. One portfolio.
          </h2>
          <p className="mt-4 max-w-[560px] mx-auto text-[15px] text-[var(--stripe-ink-muted)]">
            Hover or tap any node to read what happens. The orbit keeps drifting on its own, so you
            don't have to click through anything.
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
      <div className="max-w-[1111px] mx-auto px-6">
        <div ref={ref} className="reveal mb-14 max-w-[780px]">
          <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-ink-faint)] mb-3">
            Features
          </div>
          <h2 className="text-[34px] sm:text-[52px] font-bold tracking-[-0.02em] leading-[1.06] text-[var(--stripe-ink)]">
            The obvious stuff,{" "}
            <span className="text-[var(--stripe-ink-muted)]">done properly. Plus a couple of things other trackers never got around to.</span>
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
      <div className="stripe-card p-7 h-full flex flex-col">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center mb-5 text-[var(--stripe-accent)]"
          style={{
            background: "var(--stripe-accent-soft)",
            boxShadow: "inset 0 0 0 1px rgba(99, 91, 255, 0.15)",
          }}
        >
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="text-[17px] font-bold tracking-tight text-[var(--stripe-ink)] mb-2">
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
      <div className="max-w-[1111px] mx-auto px-6">
        <div ref={ref} className="reveal max-w-[900px] mb-12">
          <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-ink-faint)] mb-3">
            What makes Beacon different
          </div>
          <h2 className="text-[34px] sm:text-[52px] font-bold tracking-[-0.02em] leading-[1.06] text-[var(--stripe-ink)]">
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
      <div className="stripe-card p-7 h-full flex gap-4">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white"
          style={{ background: "var(--stripe-accent)" }}
        >
          <Check className="w-4 h-4" strokeWidth={2.5} />
        </div>
        <div>
          <h3 className="text-[17px] font-bold tracking-tight text-[var(--stripe-ink)] mb-1.5">
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
    { icon: Eye,          title: "Read-only access",      body: "We can read your positions and history. We can't place trades or move money — we never asked for that permission." },
    { icon: Lock,         title: "Never your password",   body: "OAuth via SnapTrade or Plaid. Your brokerage credentials skip our servers entirely." },
    { icon: ShieldCheck,  title: "Bank-grade encryption", body: "TLS 1.3 in transit. AES-256 at rest. Bcrypt for passwords, so nobody at Beacon can read yours." },
    { icon: CreditCard,   title: "Your data, portable",   body: "One-click CSV export, and a delete button that actually empties the drawer." },
  ];
  return (
    <section id="security" className="py-24 sm:py-32">
      <div ref={ref} className="reveal max-w-[1111px] mx-auto px-6 grid lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-16 items-start">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-ink-faint)] mb-3">
            Security
          </div>
          <h2 className="text-[34px] sm:text-[52px] font-bold tracking-[-0.02em] leading-[1.06] text-[var(--stripe-ink)]">
            Your money is your business.
            <br />
            <span className="text-[var(--stripe-ink-muted)]">Your data is too.</span>
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-[1.65] text-[var(--stripe-ink-muted)]">
            Beacon is built to the same standards as the brokerages it connects to. In practice we
            hold strictly less than they do: no passwords, no trading rights, and a one-click delete
            that actually empties the drawer.
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
                    style={{ background: "var(--stripe-accent-soft)", color: "var(--stripe-accent-strong)" }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <h4 className="text-[14px] font-bold tracking-tight text-[var(--stripe-ink)]">
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
      <div className="max-w-[1111px] mx-auto px-6">
        <div ref={ref} className="reveal text-center mb-14 max-w-[640px] mx-auto">
          <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-ink-faint)] mb-3">
            Pricing
          </div>
          <h2 className="text-[34px] sm:text-[52px] font-bold tracking-[-0.02em] leading-[1.06] text-[var(--stripe-ink)]">
            Start free. Upgrade when you outgrow it.
          </h2>
          <p className="mt-4 text-[15px] text-[var(--stripe-ink-muted)]">
            No surprise fees. Cancel anytime. 14-day refund on every paid plan.
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
        className={`relative h-full rounded-2xl p-7 sm:p-8 bg-white ${
          accent ? "stripe-gradient-border shadow-[0_20px_40px_-20px_rgba(99,91,255,0.28)]" : "stripe-card"
        } ${comingSoon ? "grayscale opacity-80" : ""}`}
      >
        {tier.badge && !comingSoon && (
          <div
            className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.18em] font-mono font-semibold px-3 py-1 rounded-full text-white"
            style={{ background: "var(--stripe-accent)" }}
          >
            {tier.badge}
          </div>
        )}

        <div className="text-[13px] font-semibold tracking-tight text-[var(--stripe-ink)]">{tier.name}</div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-[44px] sm:text-[52px] font-bold tracking-tight text-[var(--stripe-ink)]">
            {tier.price}
          </span>
          <span className="text-[13px] text-[var(--stripe-ink-muted)]">{tier.cadence}</span>
        </div>
        {tier.annual && (
          <div className="mt-1 text-[12px] font-mono text-[var(--stripe-ink-muted)]">{tier.annual}</div>
        )}
        <p className="mt-4 text-[14px] leading-[1.5] text-[var(--stripe-ink-muted)] min-h-[40px]">{tier.blurb}</p>

        {comingSoon ? (
          <button disabled aria-disabled="true" className="mt-6 w-full inline-flex items-center justify-center gap-2 h-11 rounded-full border border-[var(--stripe-hairline)] text-[var(--stripe-ink-muted)] cursor-not-allowed text-[13px]">
            <X className="w-3.5 h-3.5" />
            {tier.cta}
          </button>
        ) : (
          <Link to="/register" className={`mt-6 w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-full text-[13px] font-medium transition-all ${
            accent ? "stripe-btn-primary" : "stripe-btn-ghost"
          }`}>
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

      {/* Elite coming-soon overlay */}
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
      <div className="max-w-[880px] mx-auto px-6">
        <div ref={ref} className="reveal text-center mb-12">
          <div className="text-[11px] uppercase tracking-[0.18em] font-mono text-[var(--stripe-ink-faint)] mb-3">
            FAQ
          </div>
          <h2 className="text-[34px] sm:text-[52px] font-bold tracking-[-0.02em] leading-[1.06] text-[var(--stripe-ink)]">
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
        <span className={`flex-shrink-0 w-7 h-7 rounded-full border border-[var(--stripe-hairline)] flex items-center justify-center text-[var(--stripe-ink-muted)] transition-transform duration-300 ${
          isOpen ? "rotate-45 bg-[var(--stripe-accent)] text-white border-[var(--stripe-accent)]" : "group-hover:border-[var(--stripe-ink-muted)]"
        }`}>
          <Plus className="w-3.5 h-3.5" />
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${
        isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}>
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
      <div ref={ref} className="reveal max-w-[1111px] mx-auto px-6">
        {/* Light card. One tasteful violet corner wash, otherwise white. */}
        <div
          className="relative overflow-hidden rounded-[28px] border border-[var(--stripe-hairline)] bg-white"
          style={{
            backgroundImage:
              "radial-gradient(60% 80% at 100% 0%, rgba(99,91,255,0.10) 0%, transparent 55%), radial-gradient(40% 60% at 0% 100%, rgba(251,118,250,0.08) 0%, transparent 55%)",
          }}
        >
          <div className="relative px-8 sm:px-16 py-16 sm:py-20 text-center">
            <h2 className="text-[32px] sm:text-[56px] font-bold tracking-[-0.02em] leading-[1.04] text-[var(--stripe-ink)]">
              Start tracking your whole portfolio.
              <br />
              <span className="text-[var(--stripe-ink-muted)]">In under five minutes.</span>
            </h2>
            <p className="mt-5 text-[15px] sm:text-[17px] text-[var(--stripe-ink-muted)] max-w-[560px] mx-auto leading-[1.55]">
              Free for one brokerage. No credit card, no drip-to-paid trial, and nobody's
              reselling your holdings to a data broker.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/register" className="stripe-btn-primary inline-flex items-center gap-1.5 text-[14px]">
                Get started free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/demo" className="stripe-btn-ghost inline-flex items-center gap-1.5 text-[14px]">
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
      <div className="max-w-[1111px] mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-[var(--stripe-ink-muted)]">
        <div className="flex items-center gap-2">
          <BeaconMark size={18} />
          <span className="font-semibold text-[var(--stripe-ink)]">{APP_NAME}</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <a href="#manifesto" className="hover:text-[var(--stripe-ink)] transition-colors">Why Beacon</a>
          <a href="#features"  className="hover:text-[var(--stripe-ink)] transition-colors">Features</a>
          <a href="#pricing"   className="hover:text-[var(--stripe-ink)] transition-colors">Pricing</a>
          <a href="#faq"       className="hover:text-[var(--stripe-ink)] transition-colors">FAQ</a>
          <a
            href="https://beacon-three-liard.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-[var(--stripe-ink)] transition-colors"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Status
          </a>
          <a
            href="https://github.com/kazoosa/Beacon/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--stripe-ink)] transition-colors"
          >
            What's new
          </a>
          <Link to="/terms"   className="hover:text-[var(--stripe-ink)] transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-[var(--stripe-ink)] transition-colors">Privacy</Link>
          <Link to="/login"   className="hover:text-[var(--stripe-ink)] transition-colors">Sign in</Link>
        </div>
      </div>
      <div className="max-w-[1111px] mx-auto px-6 pb-8 text-[11px] text-[var(--stripe-ink-muted)]/90 text-center sm:text-left">
        Beacon is a portfolio tracking tool, not a registered broker-dealer or investment advisor.
        Nothing here is financial advice. <Bell className="inline w-3 h-3 align-[-2px]" /> Price alerts,
        dividend forecasts, and allocation drift are informational.
      </div>
    </footer>
  );
}

