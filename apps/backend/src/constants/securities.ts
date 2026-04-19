export interface SecuritySeed {
  tickerSymbol: string;
  name: string;
  type: "equity" | "etf" | "mutual_fund" | "fixed_income" | "cash";
  closePrice: number;
  exchange: string | null;
  cusip?: string;
  isin?: string;
  paysDividend?: boolean;
}

export const SECURITIES: SecuritySeed[] = [
  { tickerSymbol: "AAPL", name: "Apple Inc.", type: "equity", closePrice: 224.3, exchange: "NASDAQ", paysDividend: true },
  { tickerSymbol: "MSFT", name: "Microsoft Corporation", type: "equity", closePrice: 415.0, exchange: "NASDAQ", paysDividend: true },
  { tickerSymbol: "NVDA", name: "NVIDIA Corporation", type: "equity", closePrice: 118.5, exchange: "NASDAQ", paysDividend: true },
  { tickerSymbol: "GOOGL", name: "Alphabet Inc. Class A", type: "equity", closePrice: 168.4, exchange: "NASDAQ", paysDividend: true },
  { tickerSymbol: "TSLA", name: "Tesla, Inc.", type: "equity", closePrice: 245.1, exchange: "NASDAQ" },
  { tickerSymbol: "META", name: "Meta Platforms, Inc.", type: "equity", closePrice: 486.2, exchange: "NASDAQ", paysDividend: true },
  { tickerSymbol: "AMZN", name: "Amazon.com, Inc.", type: "equity", closePrice: 178.0, exchange: "NASDAQ" },
  { tickerSymbol: "VTI", name: "Vanguard Total Stock Market ETF", type: "etf", closePrice: 278.0, exchange: "NYSEARCA", paysDividend: true },
  { tickerSymbol: "SPY", name: "SPDR S&P 500 ETF Trust", type: "etf", closePrice: 550.2, exchange: "NYSEARCA", paysDividend: true },
  { tickerSymbol: "QQQ", name: "Invesco QQQ Trust", type: "etf", closePrice: 478.6, exchange: "NASDAQ", paysDividend: true },
  { tickerSymbol: "SCHD", name: "Schwab US Dividend Equity ETF", type: "etf", closePrice: 82.1, exchange: "NYSEARCA", paysDividend: true },
  { tickerSymbol: "VXUS", name: "Vanguard Total Intl Stock ETF", type: "etf", closePrice: 62.4, exchange: "NASDAQ", paysDividend: true },
  { tickerSymbol: "BND", name: "Vanguard Total Bond Market ETF", type: "fixed_income", closePrice: 73.9, exchange: "NASDAQ", paysDividend: true },
  { tickerSymbol: "VTSAX", name: "Vanguard Total Stock Market Index Admiral", type: "mutual_fund", closePrice: 138.0, exchange: null, paysDividend: true },
  { tickerSymbol: "FXAIX", name: "Fidelity 500 Index Fund", type: "mutual_fund", closePrice: 200.1, exchange: null, paysDividend: true },
];
