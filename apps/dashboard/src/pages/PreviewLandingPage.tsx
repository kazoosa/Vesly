import { Calendar, Code, FileText, User, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { AnimatedHero } from "../components/ui/animated-hero";
import { AuroraBackground } from "../components/ui/aurora-background";
import RadialOrbitalTimeline, { type TimelineItem } from "../components/ui/radial-orbital-timeline";
import ScrollExpandMedia from "../components/ui/scroll-expansion-hero";

/**
 * PREVIEW route — not wired into the live landing yet.
 * Assembles all 5 marketplace components so the user can evaluate them.
 * If approved, pieces get merged into LandingPage.tsx. If not, this file
 * and the ui/ components get deleted.
 */
const timelineData: TimelineItem[] = [
  {
    id: 1,
    title: "Sign up",
    date: "30 seconds",
    content: "Email + password. No card, no phone, no onboarding quiz.",
    category: "Start",
    icon: Calendar,
    relatedIds: [2],
    status: "completed",
    energy: 100,
  },
  {
    id: 2,
    title: "Connect brokerage",
    date: "2 minutes",
    content: "Auto-sync via OAuth or upload a CSV. 20+ brokerages supported.",
    category: "Connect",
    icon: FileText,
    relatedIds: [1, 3],
    status: "completed",
    energy: 90,
  },
  {
    id: 3,
    title: "See holdings",
    date: "Immediate",
    content: "Consolidated view across every account you connected.",
    category: "View",
    icon: Code,
    relatedIds: [2, 4],
    status: "in-progress",
    energy: 70,
  },
  {
    id: 4,
    title: "Track dividends",
    date: "Automatic",
    content: "YTD totals, monthly breakdown, and a 12-month forecast.",
    category: "Income",
    icon: User,
    relatedIds: [3, 5],
    status: "pending",
    energy: 50,
  },
  {
    id: 5,
    title: "Rebalance",
    date: "On demand",
    content: "See your allocation drift and know exactly what to sell.",
    category: "Optimize",
    icon: Clock,
    relatedIds: [4],
    status: "pending",
    energy: 30,
  },
];

export function PreviewLandingPage() {
  return (
    <div className="min-h-screen bg-bg-base">
      {/* Top banner — makes it crystal clear this is a preview route */}
      <div className="bg-amber-100 dark:bg-amber-950/40 border-b border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-100 text-xs text-center py-2 px-4">
        <strong>PREVIEW ROUTE</strong> — this is a visual evaluation of 5 marketplace components.
        The live landing is at <Link to="/" className="underline font-medium">/</Link>.
      </div>

      {/* 1. scroll-expansion-hero — the page opener (scroll-hijacks until expanded) */}
      <ScrollExpandMedia
        mediaType="image"
        mediaSrc="https://images.unsplash.com/photo-1642543492481-44e81e3914a6?q=80&w=1600&auto=format&fit=crop"
        bgImageSrc="https://images.unsplash.com/photo-1560472354-b33ff0c44a43?q=80&w=1920&auto=format&fit=crop"
        title="Your Portfolio"
        date="One dashboard"
        scrollToExpand="Scroll to expand"
        textBlend
      >
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-semibold mb-4 text-fg-primary">
            Keep scrolling
          </h2>
          <p className="text-lg text-fg-secondary">
            Everything below is what the marketplace components look like on Beacon.
          </p>
        </div>
      </ScrollExpandMedia>

      {/* 2. aurora-background wrapping the animated-hero */}
      <AuroraBackground className="min-h-[80vh]">
        <AnimatedHero />
      </AuroraBackground>

      {/* 3. radial-orbital-timeline — used as a 'how it works' showcase */}
      <section className="py-24 bg-bg-base">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted mb-3">
              How it works
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-fg-primary max-w-3xl mx-auto">
              Click any node. They're all connected.
            </h2>
            <p className="text-fg-secondary mt-4 max-w-xl mx-auto">
              The five steps of the Beacon flow, as an orbital map.
            </p>
          </div>
          <RadialOrbitalTimeline timelineData={timelineData} />
        </div>
      </section>

      {/* Link to the sign-in preview */}
      <section className="py-24 bg-bg-overlay border-t border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted mb-3">
            Sign-in preview
          </div>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-fg-primary mb-4">
            Three.js shader sign-in
          </h2>
          <p className="text-fg-secondary mb-6">
            Separate page so the full-screen canvas can take over. Open it in a new tab.
          </p>
          <Link
            to="/preview-signin"
            className="inline-flex items-center justify-center rounded-md bg-fg-primary text-bg-base h-11 px-8 font-medium hover:bg-fg-primary/90 transition-colors"
          >
            Open /preview-signin →
          </Link>
        </div>
      </section>
    </div>
  );
}
