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
    content: "A single view across every account you've connected. Deduped by ticker, sortable by whatever you care about, and you can expand any row to see which accounts actually hold it.",
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
    body: "Every share you own, across every broker you've connected, in one table. You can sort it, filter it, and download it as CSV.",
  },
  {
    icon: RefreshCw,
    title: "Always in sync",
    body: "Background refresh keeps your numbers up to date. Connect once and you can retire the spreadsheet.",
  },
  {
    icon: Coins,
    title: "Dividend intelligence",
    body: "Monthly income, YTD totals, a 12-month forward forecast, and who your biggest payers actually are. Dividend tracking that does math instead of just listing.",
  },
  {
    icon: PieChart,
    title: "Allocation breakdown",
    body: "Three views of your allocation: by security, by brokerage, by asset class. You'll see your real concentration before the market does.",
  },
  {
    icon: LineChart,
    title: "Performance tracking",
    body: "Day, YTD, and total return. Benchmark against the S&P 500 or pick your own index.",
  },
  {
    icon: Upload,
    title: "CSV fallback",
    body: "Broker not supported yet? Export a CSV and we'll parse it. Every major format, most of the weirder ones too.",
  },
];

const differentiators = [
  {
    title: "Every brokerage, not just the US big three",
    body: "Robinhood, IBKR, Vanguard, Wealthsimple, Questrade, DEGIRO, Trading212, Moomoo, eToro, plus Coinbase, Kraken, and Binance. Twenty-plus out of the box, and we add more when people ask.",
  },
  {
    title: "Read-only, always. We never hold your keys.",
    body: "Auto-sync goes through SnapTrade (and Plaid, for some plans) via OAuth. Your brokerage password never reaches us. We also don't ask for trading permissions, which means we couldn't move money even if we wanted to.",
  },
  {
    title: "Not a dashboard for apps that already died",
    body: "Mint shut down. Personal Capital got pivoted into something else. Snowball charges you a subscription for a pie chart. Beacon is small, affordable, and not trying to sell to anyone.",
  },
  {
    title: "You own your data, and can take it with you",
    body: "One-click CSV export of everything you have in Beacon. One-click account deletion that actually deletes, not the usual 'deactivated for 30 days then resurrected'. No dark patterns.",
  },
];

// (FAQ data lives in `faqItems` further down, next to the <Faq /> component.)

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
            to="/preview-signin"
            className="hidden sm:inline-flex items-center h-9 px-3 rounded-md text-sm text-fg-secondary hover:text-fg-primary hover:bg-bg-hover transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/preview-signin"
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
            Mint shut down. Personal Capital got swallowed. Snowball wants $10/month for a pie chart.
            The spreadsheet you keep promising to update hasn't been touched since March.
          </p>
          <p>
            Beacon is the thing we wanted. One place that pulls in your positions, your dividends,
            and your transactions. Read-only, so it can't do anything you didn't ask for. Cheap
            enough that you never have to wonder whether it's worth the cost.
          </p>
        </div>
        <div className="mt-10 inline-flex items-center gap-2 text-xs text-fg-muted">
          <Sparkles className="w-4 h-4" />
          Built by people who own more than one brokerage. We make money from subscriptions, not your data.
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
            The orbit below walks through what happens, from signup through rebalancing. Hover or tap
            any node to read that step. You don't have to remember any of it.
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
            The obvious stuff. Plus the bits other trackers never got around to.
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
    { icon: Eye, title: "Read-only access", body: "We can read your positions and history. We can't place trades or move money, because we never asked for that permission." },
    { icon: Lock, title: "Never your password", body: "OAuth via SnapTrade or Plaid. Your brokerage credentials go straight from your browser to your broker, skipping our servers entirely." },
    { icon: ShieldCheck, title: "Bank-grade encryption", body: "TLS 1.3 in transit. AES-256 at rest. Bcrypt for passwords, so nobody at Beacon can read yours." },
    { icon: CreditCard, title: "Your data, portable", body: "One-click CSV export, and a delete button that empties the drawer instead of moving your stuff to a back room." },
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
              Beacon is built to the same standards as the brokerages it connects to. In practice we
              hold strictly less than they do: no passwords, no trading rights, and a one-click delete
              that actually empties the drawer.
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
    q: "Which brokerages does Beacon actually work with?",
    a: "Auto-sync covers 20+ brokers through SnapTrade: Robinhood, Interactive Brokers, Vanguard US, Webull, E*TRADE, Wealthsimple, Public, tastytrade, Questrade, Moomoo, eToro, TD Direct Investing, DEGIRO, Trading212, AJ Bell, Zerodha, Upstox, CommSec, Stake, Bux, plus Coinbase, Kraken, and Binance for crypto. Fidelity and Schwab don't expose an open API, so for those we parse CSV exports. Same deal for anything else not on the list.",
  },
  {
    q: "Can Beacon see my password or place trades?",
    a: "No to both. Auto-sync uses OAuth, which means your credentials travel straight from your browser to your broker. Beacon never sees them. We also don't ask for trading permissions, so we couldn't buy, sell, or move money even if we wanted to.",
  },
  {
    q: "What does the Free plan actually include?",
    a: "One brokerage via CSV upload, the core holdings and dividend views, and basic allocation. No time limit, no credit card, and nothing crippled to the point of being useless. Pro is there when you add a second account and want auto-sync.",
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
    a: "Fair question. The short answer: we can't hold anything valuable. We can't trade, we can't send money, and we can't read your brokerage password. The worst case in a breach is someone seeing what stocks you own, which is honestly less bad than what already leaks out of a typical email inbox.",
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
            Straight answers. If something's missing, email us and we'll add it.
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
          Free forever for one brokerage. No credit card, no trial-to-paid gotcha, and nobody's
          reselling your holdings to a data broker.
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
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <a href="#manifesto" className="hover:text-fg-primary transition-colors">
            Why Beacon
          </a>
          <a href="#features" className="hover:text-fg-primary transition-colors">
            Features
          </a>
          <a href="#faq" className="hover:text-fg-primary transition-colors">
            FAQ
          </a>
          <Link to="/terms" className="hover:text-fg-primary transition-colors">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-fg-primary transition-colors">
            Privacy
          </Link>
          <Link to="/preview-signin" className="hover:text-fg-primary transition-colors">
            Sign in
          </Link>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8 text-[11px] text-fg-muted/80 text-center sm:text-left">
        Beacon is a portfolio tracking tool, not a registered broker-dealer or investment advisor.
        Nothing here is financial advice. <Bell className="inline w-3 h-3 align-[-2px]" /> Price alerts,
        dividend forecasts, and allocation drift are informational.
      </div>
    </footer>
  );
}
