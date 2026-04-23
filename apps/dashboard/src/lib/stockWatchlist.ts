/**
 * Curated list of popular US-listed tickers to show in the Stocks page
 * left rail when the demo / user doesn't hold many stocks of their
 * own. Deduped against live holdings at runtime, so a stock you
 * already own won't appear twice.
 *
 * `BRK-B` is the canonical Yahoo-dash form; the service normalises
 * `BRK.B` -> `BRK-B` on the way in, so either works from the URL bar.
 */
export const STOCK_WATCHLIST: string[] = [
  "AAPL",
  "GOOGL",
  "MSFT",
  "TSLA",
  "AMZN",
  "NVDA",
  "META",
  "NFLX",
  "AMD",
  "JPM",
  "V",
  "PYPL",
  "DIS",
  "BRK-B",
  "SOFI",
  "PLTR",
  "COIN",
  "UBER",
  "SPOT",
  "SNOW",
];
