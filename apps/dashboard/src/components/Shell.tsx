import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../lib/auth";
import { ConnectButton } from "./ConnectButton";

const NAV = [
  { to: "/", label: "Overview", icon: "○" },
  { to: "/holdings", label: "Holdings", icon: "▤" },
  { to: "/transactions", label: "Transactions", icon: "⇅" },
  { to: "/dividends", label: "Dividends", icon: "◈" },
  { to: "/allocation", label: "Allocation", icon: "◐" },
  { to: "/accounts", label: "Accounts", icon: "⊞" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { developer, logout } = useAuth();
  return (
    <div className="min-h-screen flex bg-bg-base">
      <aside className="w-60 bg-bg-raised border-r border-border-subtle flex flex-col">
        <div className="h-14 flex items-center gap-2 px-5 border-b border-border-subtle">
          <span className="w-7 h-7 rounded-md bg-gradient-to-br from-accent-green to-emerald-700 inline-flex items-center justify-center text-bg-base text-xs font-bold">
            $
          </span>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-sm text-white">All Accounts</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Stocks</span>
          </div>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-5 py-2 text-sm",
                  isActive
                    ? "text-white font-semibold bg-bg-overlay border-l-2 border-accent-green -ml-[2px]"
                    : "text-slate-400 hover:bg-bg-hover hover:text-slate-200",
                )
              }
            >
              <span className="w-4 text-center text-slate-500">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border-subtle">
          <ConnectButton />
        </div>
        <div className="px-5 py-3 border-t border-border-subtle">
          <div className="text-xs text-slate-400 truncate">{developer?.email}</div>
          <button className="mt-1 text-xs text-slate-500 hover:text-slate-300" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 bg-bg-base">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
