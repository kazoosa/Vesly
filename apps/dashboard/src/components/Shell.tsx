import { NavLink } from "react-router-dom";
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
  { to: "/", label: "Overview", Icon: IconDashboard },
  { to: "/holdings", label: "Holdings", Icon: IconLayers },
  { to: "/transactions", label: "Transactions", Icon: IconArrows },
  { to: "/dividends", label: "Dividends", Icon: IconCoins },
  { to: "/allocation", label: "Allocation", Icon: IconPie },
  { to: "/accounts", label: "Accounts", Icon: IconBuilding },
  { to: "/settings", label: "Settings", Icon: IconSettings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { developer, logout } = useAuth();
  const { resolvedTheme, toggle } = useTheme();

  return (
    <div className="min-h-screen flex bg-bg-base">
      <aside className="w-60 bg-bg-raised border-r border-border-subtle flex flex-col">
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
            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-fg-muted hover:text-fg-primary hover:bg-bg-hover transition-colors"
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
        </div>

        <nav className="flex-1 py-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-5 py-2 text-[13px] transition-colors",
                  isActive
                    ? "text-fg-primary font-semibold bg-bg-overlay border-l-2 border-fg-primary -ml-[2px]"
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
            className="mt-1 text-[11px] text-fg-muted hover:text-fg-secondary"
            onClick={logout}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 bg-bg-base">
        <div className="p-6 max-w-7xl mx-auto animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
