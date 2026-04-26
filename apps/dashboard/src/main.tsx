import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";
import { App } from "./App";

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      // staleTime 5 min: returning to a previously visited page renders
      // its cached data instantly without a background refetch storm.
      // gcTime 30 min: cached data survives in memory long enough that
      // navigating away and back doesn't lose it. Combined effect:
      // the second time the user visits any page, it's instant.
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      // refetchOnWindowFocus stays default (true) so when the user
      // tabs back to Beacon after a coffee break, prices update.
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
