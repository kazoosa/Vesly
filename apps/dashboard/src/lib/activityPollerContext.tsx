import { createContext, useContext } from "react";
import { useActivityPoller, type ActivityPollerControls } from "./useActivityPoller";

const ActivityPollerContext = createContext<ActivityPollerControls | null>(null);

export function ActivityPollerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useActivityPoller();
  return (
    <ActivityPollerContext.Provider value={value}>
      {children}
    </ActivityPollerContext.Provider>
  );
}

/**
 * Read the poller. Returns null when called outside the provider —
 * use it as `useActivityPollerContext()?.start()` so components in
 * trees without the provider (e.g. /login) don't crash.
 */
export function useActivityPollerContext(): ActivityPollerControls | null {
  return useContext(ActivityPollerContext);
}
