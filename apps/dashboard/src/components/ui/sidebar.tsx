import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import {
  Building2,
  ChevronsUpDown,
  Coins,
  LayoutDashboard,
  Layers,
  LineChart,
  LogOut,
  Moon,
  PieChart,
  Repeat,
  Settings as SettingsIcon,
  Sun,
  UserCircle,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { ScrollArea } from "./scroll-area";
import { Avatar, AvatarFallback } from "./avatar";
import { Separator } from "./separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";
import { APP_NAME } from "../../lib/brand";

/**
 * Collapsible sidebar — sits at 49px wide by default and expands to 240px
 * while the cursor is over it. Built with framer-motion for the width
 * + label fade animations. Active route is detected via React Router's
 * useLocation.
 *
 * Mobile renders the existing drawer (Shell.tsx); this component is
 * desktop-only because hover-to-expand has no equivalent on touch.
 */

const sidebarVariants: Variants = {
  open: { width: "15rem" },
  closed: { width: "3.05rem" },
};

const labelVariants: Variants = {
  open: {
    x: 0,
    opacity: 1,
    transition: { x: { stiffness: 1000, velocity: -100 } },
  },
  closed: {
    x: -16,
    opacity: 0,
    transition: { x: { stiffness: 100 } },
  },
};

const transitionProps = {
  type: "tween" as const,
  ease: "easeOut" as const,
  duration: 0.18,
};

const NAV: Array<{ to: string; label: string; Icon: typeof LayoutDashboard; end?: boolean }> = [
  { to: "/app", label: "Overview", Icon: LayoutDashboard, end: true },
  { to: "/app/holdings", label: "Holdings", Icon: Layers },
  { to: "/app/stocks", label: "Stocks", Icon: LineChart },
  { to: "/app/transactions", label: "Transactions", Icon: Repeat },
  { to: "/app/dividends", label: "Dividends", Icon: Coins },
  { to: "/app/allocation", label: "Allocation", Icon: PieChart },
  { to: "/app/accounts", label: "Accounts", Icon: Building2 },
  { to: "/app/settings", label: "Settings", Icon: SettingsIcon },
];

export const SIDEBAR_COLLAPSED_PX = 49;

export function SessionNavBar() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const { pathname } = useLocation();
  const { developer, logout } = useAuth();
  const { resolvedTheme, toggle } = useTheme();

  function isActive(to: string, end?: boolean) {
    if (end) return pathname === to;
    return pathname === to || pathname.startsWith(to + "/");
  }

  const initials = (developer?.name ?? developer?.email ?? "?")
    .trim()
    .split(/\s+|@/)[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <motion.aside
      className={cn(
        "fixed left-0 top-0 z-40 h-full hidden md:block shrink-0",
        "bg-bg-raised text-fg-secondary border-r border-border-subtle",
      )}
      initial={isCollapsed ? "closed" : "open"}
      animate={isCollapsed ? "closed" : "open"}
      variants={sidebarVariants}
      transition={transitionProps}
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => setIsCollapsed(true)}
      aria-label="Primary navigation"
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="h-14 shrink-0 flex items-center gap-2 px-2.5 border-b border-border-subtle">
          <div className="w-8 h-8 rounded-md bg-fg-primary text-bg-base flex items-center justify-center text-[11px] font-bold shrink-0">
            {APP_NAME.slice(0, 1).toUpperCase()}
          </div>
          <motion.span
            variants={labelVariants}
            className="text-sm font-semibold text-fg-primary truncate"
          >
            {APP_NAME}
          </motion.span>
        </div>

        {/* Nav */}
        <ScrollArea className="flex-1">
          <ul className="flex flex-col gap-0.5 p-2">
            {NAV.map((item) => {
              const active = isActive(item.to, item.end);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    title={item.label}
                    className={cn(
                      "flex h-9 items-center rounded-md px-2 transition-colors gap-2",
                      active
                        ? "bg-bg-overlay text-fg-primary font-semibold"
                        : "text-fg-secondary hover:bg-bg-hover hover:text-fg-primary",
                    )}
                  >
                    <item.Icon className="h-4 w-4 shrink-0" />
                    <motion.span
                      variants={labelVariants}
                      className="text-sm whitespace-nowrap overflow-hidden"
                    >
                      {item.label}
                    </motion.span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        <Separator />

        {/* Footer — theme toggle + account */}
        <div className="p-2 flex flex-col gap-1">
          <button
            type="button"
            onClick={toggle}
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            aria-label="Toggle theme"
            className="flex h-9 items-center rounded-md px-2 gap-2 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary transition-colors"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4 shrink-0" />
            ) : (
              <Moon className="h-4 w-4 shrink-0" />
            )}
            <motion.span
              variants={labelVariants}
              className="text-sm whitespace-nowrap overflow-hidden"
            >
              {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            </motion.span>
          </button>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-9 items-center rounded-md px-1.5 gap-2 hover:bg-bg-hover transition-colors w-full"
                aria-label="Account menu"
              >
                <Avatar className="size-6">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <motion.span
                  variants={labelVariants}
                  className="flex flex-1 items-center justify-between gap-2 min-w-0"
                >
                  <span className="text-sm text-fg-primary truncate text-left">
                    {developer?.name ?? developer?.email ?? "Account"}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-fg-muted shrink-0" />
                </motion.span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" sideOffset={8} className="min-w-[14rem]">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <Avatar className="size-8">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg-primary truncate">
                    {developer?.name ?? "Account"}
                  </div>
                  <div className="text-[11px] text-fg-muted truncate">
                    {developer?.email}
                  </div>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/app/settings">
                  <UserCircle className="h-4 w-4" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => logout()}>
                <LogOut className="h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.aside>
  );
}
