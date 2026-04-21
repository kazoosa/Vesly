import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { ConnectButton } from "./ConnectButton";
import { APP_NAME } from "../lib/brand";
import { BeaconMark } from "./BeaconMark";
import {
  IconDashboard,
  IconLayers,
  IconArrows,
  IconCoins,
  IconPie,
  IconBuilding,
  IconSettings,
  IconSun,
  IconMoon,
} from "./Icon";

const NAV = [
  { to: "/app", label: "Overview", Icon: IconDashboard },
  { to: "/app/holdings", label: "Holdings", Icon: IconLayers },
  { to: "/app/transactions", label: "Transactions", Icon: IconArrows },
  { to: "/app/dividends", label: "Dividends", Icon: IconCoins },
  { to: "/app/allocation", label: "Allocation", Icon: IconPie },
  { to: "/app/accounts", label: "Accounts", Icon: IconBuilding },
  { to: "/app/settings", label: "Settings", Icon: IconSettings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { developer, logout } = useAuth();
  const { resolvedTheme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer on route change.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Lock page scroll when drawer is open.
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [menuOpen]);

  const currentLabel =
    NAV.find((n) => {
      if (n.to === "/app") return location.pathname === "/app";
      return location.pathname.startsWith(n.to);
    })?.label ?? "Beacon";

  return (
    <div className="min-h-screen bg-bg-base md:flex">
      {/* Mobile top bar — only visible under md breakpoint */}
      <div className="md:hidden sticky top-0 z-40 h-14 flex items-center justify-between px-4 bg-bg-raised border-b border-border-subtle">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="w-11 h-11 -ml-2 inline-flex items-center justify-center text-fg-primary rounded-lg hover:bg-bg-hover"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="flex items-center gap-2 text-fg-primary">
          <BeaconMark size={18} />
          <span className="font-semibold text-sm">{currentLabel}</span>
        </div>
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="w-11 h-11 -mr-2 inline-flex items-center justify-center text-fg-muted hover:text-fg-primary rounded-lg hover:bg-bg-hover"
        >
          {resolvedTheme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
      </div>

      {/* Backdrop when drawer is open */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-fg-primary/30 backdrop-blur-sm motion-safe:animate-fade-in"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Sidebar — fixed drawer on mobile, sticky sibling on desktop */}
      <aside
        className={clsx(
          "bg-bg-raised flex flex-col shrink-0 border-r border-border-subtle",
          "fixed z-50 inset-y-0 left-0 w-[280px] max-w-[85vw] transition-transform duration-300 ease-out",
          menuOpen ? "translate-x-0" : "-translate-x-full",
          "md:sticky md:top-0 md:h-screen md:w-60 md:translate-x-0 md:transition-none md:overflow-y-auto",
        )}
        style={{ boxShadow: "1px 0 0 0 rgb(var(--border-subtle))" }}
        aria-label="Primary navigation"
      >
        <div className="h-14 flex items-center justify-between gap-2 px-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5 text-fg-primary">
            <BeaconMark size={22} />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-sm">{APP_NAME}</span>
              <span className="text-[10px] text-fg-muted uppercase tracking-wider">
                Portfolio
              </span>
            </div>
          </div>
          <button
            onClick={toggle}
            className="hidden md:inline-flex w-9 h-9 rounded-md items-center justify-center text-fg-muted hover:text-fg-primary hover:bg-bg-hover transition-colors"
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          {/* Close button on mobile */}
          <button
            onClick={() => setMenuOpen(false)}
            className="md:hidden w-11 h-11 -mr-2 inline-flex items-center justify-center text-fg-muted hover:text-fg-primary"
            aria-label="Close menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto" aria-label="Main navigation">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/app"}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 mx-2 rounded-lg px-3 py-2.5 text-[13px] transition-colors duration-150 min-h-[44px]",
                  isActive
                    ? "text-fg-primary font-semibold bg-bg-overlay"
                    : "text-fg-secondary hover:bg-bg-hover hover:text-fg-primary",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? "text-fg-primary" : "text-fg-muted"}>
                    <n.Icon size={16} />
                  </span>
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border-subtle">
          <ConnectButton />
        </div>
        <div className="px-5 py-3 border-t border-border-subtle">
          <div className="text-xs text-fg-secondary truncate">{developer?.email}</div>
          <button
            className="mt-1 text-[11px] text-fg-muted hover:text-fg-secondary min-h-[32px] -ml-1 px-1 py-1 rounded"
            onClick={logout}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 bg-bg-base">
        <div className="p-4 md:p-6 max-w-7xl mx-auto motion-safe:animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
