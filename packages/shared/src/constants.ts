export const PRODUCTS = [
  "transactions",
  "auth",
  "balance",
  "identity",
  "investments",
  "income",
] as const;
export type Product = (typeof PRODUCTS)[number];

export const ENVIRONMENTS = ["sandbox", "development", "production"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const ACCOUNT_TYPES = ["depository", "credit", "investment", "loan"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_SUBTYPES = [
  "checking",
  "savings",
  "credit card",
  "brokerage",
  "401k",
  "ira",
  "cd",
  "money market",
  "auto",
  "mortgage",
] as const;
export type AccountSubtype = (typeof ACCOUNT_SUBTYPES)[number];

export const TX_PAYMENT_CHANNELS = ["online", "in store", "other"] as const;
export type TxPaymentChannel = (typeof TX_PAYMENT_CHANNELS)[number];

export const INVESTMENT_TX_TYPES = ["buy", "sell", "dividend", "interest", "transfer", "fee"] as const;
export type InvestmentTxType = (typeof INVESTMENT_TX_TYPES)[number];

export const SECURITY_TYPES = ["equity", "etf", "mutual_fund", "fixed_income", "cash"] as const;
export type SecurityType = (typeof SECURITY_TYPES)[number];

export const WEBHOOK_EVENT_CODES = [
  "TRANSACTIONS_DEFAULT_UPDATE",
  "TRANSACTIONS_HISTORICAL_UPDATE",
  "ITEM_ERROR",
  "ITEM_LOGIN_REQUIRED",
  "HOLDINGS_DEFAULT_UPDATE",
  "INVESTMENT_TRANSACTIONS_UPDATE",
  "INCOME_VERIFICATION_STATUS_UPDATE",
] as const;
export type WebhookEventCode = (typeof WEBHOOK_EVENT_CODES)[number];

export const WEBHOOK_TYPES: Record<WebhookEventCode, string> = {
  TRANSACTIONS_DEFAULT_UPDATE: "TRANSACTIONS",
  TRANSACTIONS_HISTORICAL_UPDATE: "TRANSACTIONS",
  ITEM_ERROR: "ITEM",
  ITEM_LOGIN_REQUIRED: "ITEM",
  HOLDINGS_DEFAULT_UPDATE: "HOLDINGS",
  INVESTMENT_TRANSACTIONS_UPDATE: "INVESTMENTS_TRANSACTIONS",
  INCOME_VERIFICATION_STATUS_UPDATE: "INCOME",
};

export const ITEM_STATUSES = ["GOOD", "LOGIN_REQUIRED", "ERROR"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const TX_CATEGORIES = [
  ["Food and Drink", "Restaurants"],
  ["Food and Drink", "Coffee Shop"],
  ["Food and Drink", "Groceries"],
  ["Travel", "Airlines and Aviation"],
  ["Travel", "Ride Share"],
  ["Travel", "Gas Stations"],
  ["Shopping", "General"],
  ["Shopping", "Online Marketplaces"],
  ["Entertainment", "Streaming"],
  ["Entertainment", "Music"],
  ["Transfer", "Internal"],
  ["Transfer", "Payroll"],
  ["Payment", "Credit Card"],
  ["Healthcare", "Pharmacy"],
  ["Healthcare", "Doctor"],
  ["Service", "Utilities"],
  ["Service", "Subscription"],
] as const;
