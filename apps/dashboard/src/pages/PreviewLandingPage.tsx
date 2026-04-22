import {
  UserPlus, Link2, LayoutDashboard, Coins, Scale,
  ShieldCheck, Upload, PieChart, LineChart, Bell, RefreshCw,
  Lock, Eye, CreditCard, Sparkles, ArrowRight, Check, Plus,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatedHero } from "../components/ui/animated-hero";
import { AuroraBackground } from "../components/ui/aurora-background";
import RadialOrbitalTimeline, { type TimelineItem } from "../components/ui/radial-orbital-timeline";
import { useReveal } from "../lib/useReveal";
import { BeaconMark } from "../components/BeaconMark";
import { APP_NAME } from "../lib/brand";

/* ------------------------------------------------------------------ Data */

const timelineData: TimelineItem[] = [
  {
    id: 1,
    title: "Sign up",
    date: "30 seconds",
    content: "Email + password. No card, no phone, no onboarding quiz. You're in before a support chat would've loaded.",
    category: "Start",
    icon: UserPlus,
  },
  {
    id: 2,
    title: "Connect brokerage",
    date: "~2 minutes",
    content: "Auto-sync 20+ brokerages via read-only OAuth — or drop in a CSV. Credentials never touch Beacon's servers.",
    category: "Connect",
    icon: Link2,
  },
  {
    id: 3,
    title: "See holdings",
    date: "Instant",
    content: "Consolidated view across every account. Deduped by ticker, sorted by what you care about, expandable per-account.",
    category: "View",
    icon: LayoutDashboard,
  },
  {
    id: 4,
    title: "Track dividends",
    date: "Automatic",
    content: "YTD totals, monthly bar chart, top payers, and a forward 12-month forecast. Know what's coming, not just what came.",
    category: "Income",
    icon: Coins,
  },
  {
    id: 5,
    title: "Rebalance",
    date: "Any time",
    content: "Allocation drift by security, brokerage, and asset class. See exactly what to sell and what to buy.",
    category: "Optimize",
    icon: Scale,
  },
];

const features = [
  {
    icon: LayoutDashboard,
    title: "Unified holdings",
    body: "Every share, across every broker, in one table. Deduped, sorted, exportable.",
  },
  {
    icon: RefreshCw,
    title: "Always in sync",
    body: "Background refresh keeps your numbers live. Connect once — never touch a spreadsheet again.",
  },
  {
    icon: Coins,
    title: "Dividend intelligence",
    body: "Monthly income, YTD totals, forward 12-month forecast, top payers. Income that actually adds up.",
  },
  {
    icon: PieChart,
    title: "Allocation breakdown",
    body: "By security, by brokerage, by asset class. See your real concentration before the market finds it.",
  },
  {
    icon: LineChart,
    title: "Performance tracking",
    body: "Day, YTD, total return. Benchmark against the S&P 500 or any index you choose.",
  },
  {
    icon: Upload,
    title: "CSV fallback",
    body: "Broker not supported? Export a CSV from anywhere — Beacon parses every major format.",
  },
];

const differentiators = [
  {
    title: "Every brokerage — not just the US big three",
    body: "Robinhood, IBKR, Vanguard, Wealthsimple, Questrade, DEGIRO, Trading212, Moomoo, eToro, plus Coinbase/Kraken/Binance. Twenty-plus out of the box.",
  },
  {
    title: "Read-only, always — we never hold your keys",
    body: "Auto-sync runs through SnapTrade / Plaid via OAuth. Beacon never sees your brokerage password. We can't trade, transfer, or withdraw. Ever.",
  },
  {
    title: "Not a dashboard for apps that are already dead",
    body: "Mint shut down. Personal Capital pivoted. Snowball charges for the basics. Beacon is built lean, priced fair, and independent.",
  },
  {
    title: "You own your data — and can take it with you",
    body: "One-click CSV export of everything. One-click account delete that actually deletes. No retention games, no dark patterns.",
  },
];

/* ------------------------------------------------------------------ Page */

export function PreviewLandingPage() {
  return (
    <div className="min-h-screen bg-bg-base text-fg-primary">
      <PreviewBanner />
      <NavBar />

      {/* Hero */}
      <AuroraBackground className="min-h-[88vh]">
        <AnimatedHero />
      </AuroraBackground>

      <TrustStrip />
      <Manifesto />
      <BeaconFlow />
      <FeatureGrid />
      <Differentiators />
      <SecurityBand />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* --------------------------------------------------------------- Banner */

function PreviewBanner() {
  return (
    <div className="bg-amber-100 dark:bg-amber-950/40 border-b border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-100 text-[11px] text-center py-1.5 px-4">
      <strong className="font-semibold">PREVIEW ROUTE</strong> — visual evaluation. Live landing is at{" "}
      <Link to="/" className="underline font-medium">/</Link>.
    </div>
  );
}

/* ------------------------------------------------------------------ Nav */

function NavBar() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-bg-base/80 border-b border-border-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/preview-landing" className="flex items-center gap-2 font-semibold tracking-tight">
          <BeaconMark size={22} />
          <span>{APP_NAME}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-fg-secondary">
          <a href="#manifesto" className="hover:text-fg-primary transition-colors">Why Beacon</a>
          <a href="#flow" className="hover:text-fg-primary transition-colors">How it works</a>
          <a href="#features" className="hover:text-fg-primary transition-colors">Features</a>
          <a href="#security" className="hover:text-fg-primary transition-colors">Security</a>
          <a href="#faq" className="hover:text-fg-primary transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden sm:inline-flex items-center h-9 px-3 rounded-md text-sm text-fg-secondary hover:text-fg-primary hover:bg-bg-hover transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center h-9 px-4 rounded-md bg-fg-primary text-bg-base text-sm font-medium hover:bg-fg-primary/90 transition-colors"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------ Trust strip */

function TrustStrip() {
  const items = [
    { label: "brokerages auto-sync", value: "20+" },
    { label: "setup time", value: "< 5 min" },
    { label: "read-only access", value: "100%" },
    { label: "forever for 1 broker", value: "Free" },
  ];
  return (
    <section className="border-y border-border-subtle bg-bg-overlay/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
        {items.map((it) => (
          <div key={it.label} className="text-center">
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-fg-primary">{it.value}</div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-fg-muted mt-1">{it.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- Manifesto */

function Manifesto() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="manifesto" className="py-24 sm:py-32">
      <div ref={ref} className="reveal max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted mb-4">
          Why Beacon
        </div>
        <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-fg-primary leading-[1.08]">
          Your money is spread across half a dozen apps.{" "}
          <span className="text-fg-secondary">It shouldn't feel that way.</span>
        </h2>
        <div className="mt-8 space-y-5 text-fg-secondary text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
          <p>
            We built Beacon because we were tired of logging into six brokerage apps to answer one
            question: <em className="text-fg-primary not-italic font-medium">what do I actually own?</em>
          </p>
          <p>
            Mint shut down. Personal Capital got swallowed. Snowball wants $10/month for a pie chart. The
            spreadsheet you keep promising to update hasn't been touched since March.
          </p>
          <p>
            Beacon is the dashboard we wanted: every position, every dividend, every transaction —
            consolidated, honest, read-only, and cheap enough that you don't have to think about it.
          </p>
        </div>
        <div className="mt-10 inline-flex items-center gap-2 text-xs text-fg-muted">
          <Sparkles className="w-4 h-4" />
          Built by investors, for investors. Independent. Not selling your data.
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Beacon flow */

function BeaconFlow() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="flow" className="py-20 sm:py-28 bg-bg-overlay/40 border-y border-border-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={ref} className="reveal text-center mb-12">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted mb-3">
            Beacon flow
          </div>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-fg-primary max-w-3xl mx-auto leading-[1.08]">
            Five steps from zero to a real portfolio view.
          </h2>
          <p className="text-fg-secondary mt-4 max-w-xl mx-auto text-base">
            The orbit below walks through what happens — from signup to rebalancing. Hover or tap any
            node to read the step. Nothing to memorize.
          </p>
        </div>
        <RadialOrbitalTimeline timelineData={timelineData} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Features */

function FeatureGrid() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={ref} className="reveal text-center mb-14 max-w-2xl mx-auto">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted mb-3">
            Features
          </div>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.08]">
            Everything you'd expect. A few things everyone else missed.
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
  feature,
  delay,
}: {
  feature: typeof features[number];
  delay: number;
}) {
  const ref = useReveal<HTMLDivElement>();
  const Icon = feature.icon;
  return (
    <div
      ref={ref}
      className="reveal group relative rounded-xl border border-border-subtle bg-bg-overlay/60 p-6 hover:bg-bg-overlay hover:border-border-strong transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Subtle top-left glow on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(400px circle at 0% 0%, rgba(255,255,255,0.06), transparent 40%)",
        }}
      />
      <div className="relative">
        <div className="w-10 h-10 rounded-lg bg-bg-base border border-border-subtle flex items-center justify-center text-fg-primary mb-4 group-hover:scale-105 transition-transform duration-300">
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="text-base font-semibold tracking-tight text-fg-primary mb-1.5">
          {feature.title}
        </h3>
        <p className="text-sm text-fg-secondary leading-relaxed">{feature.body}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ Differentiators */

function Differentiators() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="py-24 sm:py-32 bg-bg-overlay/40 border-y border-border-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={ref} className="reveal max-w-3xl mb-14">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted mb-3">
            What makes Beacon different
          </div>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.08]">
            Built for people who actually own more than one brokerage.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border-subtle rounded-xl overflow-hidden border border-border-subtle">
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
    <div
      ref={ref}
      className="reveal bg-bg-base p-7 sm:p-9 flex gap-4 hover:bg-bg-overlay transition-colors"
    >
      <div className="flex-shrink-0">
        <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-500 flex items-center justify-center">
          <Check className="w-4 h-4" strokeWidth={2.5} />
        </div>
      </div>
      <div>
        <h3 className="text-base sm:text-lg font-semibold tracking-tight text-fg-primary mb-1.5">
          {item.title}
        </h3>
        <p className="text-sm text-fg-secondary leading-relaxed">{item.body}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Security */

function SecurityBand() {
  const ref = useReveal<HTMLDivElement>();
  const points = [
    { icon: Eye, title: "Read-only access", body: "See positions and history. Can't trade, transfer, or withdraw. Ever." },
    { icon: Lock, title: "Never your password", body: "OAuth via SnapTrade / Plaid. Credentials skip our servers entirely." },
    { icon: ShieldCheck, title: "Bank-grade encryption", body: "TLS 1.3 in transit. AES-256 at rest. Bcrypt for passwords." },
    { icon: CreditCard, title: "Your data, portable", body: "One-click CSV export. One-click delete that actually deletes." },
  ];
  return (
    <section id="security" className="py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={ref} className="reveal grid lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-16 items-start">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted mb-3">
              Security
            </div>
            <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-fg-primary leading-[1.08]">
              Your money is your business.
              <br />
              Your data is too.
            </h2>
            <p className="text-fg-secondary mt-5 text-base leading-relaxed max-w-md">
              Beacon is built to the same standards as the brokerages it connects to — and we hold
              strictly less than they do. No passwords. No trading rights. Delete at any time.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {points.map((p) => (
              <SecurityCard key={p.title} item={p} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SecurityCard({ item }: { item: { icon: typeof Eye; title: string; body: string } }) {
  const ref = useReveal<HTMLDivElement>();
  const Icon = item.icon;
  return (
    <div
      ref={ref}
      className="reveal rounded-xl border border-border-subtle bg-bg-overlay/50 p-5 hover:bg-bg-overlay transition-colors"
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-md bg-bg-base border border-border-subtle flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
        <h4 className="text-sm font-semibold tracking-tight text-fg-primary">{item.title}</h4>
      </div>
      <p className="text-sm text-fg-secondary leading-relaxed">{item.body}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- FAQ */

const faqItems: { q: string; a: string }[] = [
  {
    q: "Which brokerages does Beacon support?",
    a: "Auto-sync covers Robinhood, Interactive Brokers, Webull, Vanguard US, E*TRADE, Wealthsimple, Public, tastytrade, Questrade, Moomoo, eToro, TD Direct Investing, DEGIRO, Trading212, AJ Bell, Zerodha, Upstox, CommSec, Stake, Bux — plus Coinbase, Kraken, and Binance for crypto. For anything else (including Fidelity and Schwab), upload a CSV export and Beacon parses it automatically.",
  },
  {
    q: "Can Beacon see my brokerage password?",
    a: "No. Auto-sync runs through SnapTrade (or Plaid on higher tiers), which use OAuth — credentials go straight from your browser to the brokerage. Beacon never sees, stores, or has access to them.",
  },
  {
    q: "Can Beacon move money or place trades?",
    a: "No. We request read-only access explicitly. Beacon can see your positions, transactions, and dividends. It can't trade, transfer, withdraw, or do anything that moves money — ever.",
  },
  {
    q: "What does the Free tier actually include?",
    a: "One brokerage via CSV upload, the core holdings view, dividends view, and basic allocation. No time limit and no credit card. Natural upgrade path when you add a second account.",
  },
  {
    q: "How does Beacon make money?",
    a: "Subscriptions only. Pro is $8/month, Elite is $15/month. We don't sell your data. We don't show ads. We aren't an affiliate program in disguise.",
  },
  {
    q: "Is there a refund policy?",
    a: "Yes. 14-day full refund on any paid plan, no questions asked.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. One click in settings. Your data stays exportable for 30 days after cancel in case you change your mind.",
  },
  {
    q: "What happens if I delete my account?",
    a: "Everything is removed — holdings, transactions, brokerage connections, and credentials with our partners. No retention, no shadow copies. A confirmation email is sent on completion.",
  },
];

function Faq() {
  const ref = useReveal<HTMLDivElement>();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-24 sm:py-32 bg-bg-overlay/40 border-y border-border-subtle">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div ref={ref} className="reveal text-center mb-12">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted mb-3">
            FAQ
          </div>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.08]">
            Questions people actually ask.
          </h2>
          <p className="text-fg-secondary mt-4 text-base">
            Plain answers. If something's missing, drop us a line.
          </p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-bg-base divide-y divide-border-subtle overflow-hidden">
          {faqItems.map((item, i) => {
            const isOpen = open === i;
            return (
              <FaqRow
                key={i}
                item={item}
                isOpen={isOpen}
                onToggle={() => setOpen(isOpen ? null : i)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FaqRow({
  item,
  isOpen,
  onToggle,
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
        className="w-full flex items-center justify-between gap-4 text-left px-5 sm:px-6 py-5 hover:bg-bg-hover/60 transition-colors group"
      >
        <span className="text-sm sm:text-base font-medium text-fg-primary">{item.q}</span>
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-full border border-border-strong flex items-center justify-center text-fg-secondary transition-transform duration-300 ${
            isOpen ? "rotate-45 bg-fg-primary text-bg-base border-fg-primary" : "group-hover:text-fg-primary"
          }`}
        >
          <Plus className="w-4 h-4" strokeWidth={2.2} />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="px-5 sm:px-6 pb-5 text-sm text-fg-secondary leading-relaxed max-w-2xl">
            {item.a}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Final CTA */

function FinalCta() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="py-24 sm:py-32 relative overflow-hidden">
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(124,106,255,0.18), transparent 60%), radial-gradient(ellipse 60% 60% at 50% 50%, rgba(52,211,153,0.12), transparent 55%)",
          filter: "blur(28px)",
        }}
      />
      <div ref={ref} className="reveal relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
          Start tracking your whole portfolio.
          <br />
          <span className="text-fg-secondary">In under five minutes.</span>
        </h2>
        <p className="text-fg-secondary mt-5 text-base sm:text-lg">
          Free forever for one brokerage. No card, no catch, no data selling.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/preview-signin"
            className="inline-flex items-center gap-2 h-12 px-6 rounded-md bg-fg-primary text-bg-base font-medium hover:bg-fg-primary/90 transition-colors group"
          >
            Get started free
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/preview-signin"
            className="inline-flex items-center h-12 px-6 rounded-md border border-border-strong text-fg-primary font-medium hover:bg-bg-hover transition-colors"
          >
            Try the demo
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> No credit card</span>
          <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Read-only access</span>
          <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Cancel anytime</span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Footer */

function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-bg-overlay/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-fg-muted">
        <div className="flex items-center gap-2">
          <BeaconMark size={18} />
          <span className="text-fg-secondary font-medium">{APP_NAME}</span>
          <span>· © {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/preview-signin" className="hover:text-fg-primary transition-colors">
            Sign-in preview
          </Link>
          <a href="#manifesto" className="hover:text-fg-primary transition-colors">
            Why Beacon
          </a>
          <a href="#features" className="hover:text-fg-primary transition-colors">
            Features
          </a>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8 text-[11px] text-fg-muted/80 text-center sm:text-left">
        Beacon is a portfolio tracking tool — not a registered broker-dealer or investment advisor.
        Not financial advice. <Bell className="inline w-3 h-3 align-[-2px]" /> Price alerts, dividend
        forecasts and allocation drift are informational only.
      </div>
    </footer>
  );
}
