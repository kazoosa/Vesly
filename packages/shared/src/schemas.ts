import { z } from "zod";
import {
  PRODUCTS,
  ENVIRONMENTS,
  ACCOUNT_TYPES,
  ACCOUNT_SUBTYPES,
  TX_PAYMENT_CHANNELS,
  INVESTMENT_TX_TYPES,
  SECURITY_TYPES,
  WEBHOOK_EVENT_CODES,
  ITEM_STATUSES,
} from "./constants.js";

/* -------------------------------------------------------------------------- */
/*  Auth / developer                                                          */
/* -------------------------------------------------------------------------- */

export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(200),
});

export const deleteAccountSchema = z.object({
  confirm_email: z.string().email(),
});

/* -------------------------------------------------------------------------- */
/*  Applications                                                              */
/* -------------------------------------------------------------------------- */

export const createApplicationSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().default(""),
  webhook_url: z.string().url().optional().nullable(),
  redirect_uris: z.array(z.string().url()).default([]),
  allowed_products: z.array(z.enum(PRODUCTS)).min(1),
  environment: z.enum(ENVIRONMENTS).default("sandbox"),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const patchApplicationSchema = createApplicationSchema.partial();

/* -------------------------------------------------------------------------- */
/*  Link                                                                       */
/* -------------------------------------------------------------------------- */

export const linkTokenCreateSchema = z.object({
  client_id: z.string().min(1),
  secret: z.string().min(1),
  user: z.object({
    client_user_id: z.string().min(1),
  }),
  products: z.array(z.enum(PRODUCTS)).min(1),
  client_name: z.string().min(1),
  redirect_uri: z.string().url().optional(),
  webhook: z.string().url().optional(),
  country_codes: z.array(z.string().length(2)).default(["US"]),
  language: z.string().default("en"),
});
export type LinkTokenCreateInput = z.infer<typeof linkTokenCreateSchema>;

export const publicTokenExchangeSchema = z.object({
  public_token: z.string().min(1),
});

export const itemAccessSchema = z.object({
  access_token: z.string().min(1),
});

/* -------------------------------------------------------------------------- */
/*  Session (modal ↔ backend)                                                 */
/* -------------------------------------------------------------------------- */

export const sessionSelectInstitutionSchema = z.object({
  session_id: z.string().min(1),
  institution_id: z.string().min(1),
});

export const sessionCredentialsSchema = z.object({
  session_id: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  remember_device: z.boolean().optional(),
});

export const sessionMfaSchema = z.object({
  session_id: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});

export const sessionFinalizeSchema = z.object({
  session_id: z.string().min(1),
  account_ids: z.array(z.string()).min(1),
});

/* -------------------------------------------------------------------------- */
/*  Transactions                                                              */
/* -------------------------------------------------------------------------- */

export const transactionsGetSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  account_id: z.string().optional(),
  category: z.string().optional(),
  count: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

export const transactionsSyncSchema = z.object({
  cursor: z.string().optional(),
  count: z.coerce.number().int().min(1).max(500).default(100),
});

/* -------------------------------------------------------------------------- */
/*  Sandbox                                                                   */
/* -------------------------------------------------------------------------- */

export const sandboxFireWebhookSchema = z.object({
  access_token: z.string(),
  webhook_code: z.enum(WEBHOOK_EVENT_CODES).default("TRANSACTIONS_DEFAULT_UPDATE"),
});

export const sandboxSimulateTxSchema = z.object({
  access_token: z.string(),
  account_id: z.string().optional(),
  count: z.coerce.number().int().min(1).max(50).default(5),
});

export const sandboxResetLoginSchema = z.object({
  access_token: z.string(),
});

/* -------------------------------------------------------------------------- */
/*  Response shapes (for typing clients)                                      */
/* -------------------------------------------------------------------------- */

export interface BalancesDTO {
  available: number | null;
  current: number;
  limit: number | null;
  iso_currency_code: string;
}

export interface AccountDTO {
  account_id: string;
  item_id: string;
  mask: string;
  name: string;
  official_name: string | null;
  type: (typeof ACCOUNT_TYPES)[number];
  subtype: (typeof ACCOUNT_SUBTYPES)[number];
  balances: BalancesDTO;
}

export interface TransactionDTO {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string;
  date: string;
  authorized_date: string | null;
  name: string;
  merchant_name: string | null;
  category: string[];
  category_id: string | null;
  pending: boolean;
  payment_channel: (typeof TX_PAYMENT_CHANNELS)[number];
  location: {
    address: string | null;
    city: string | null;
    region: string | null;
    postal_code: string | null;
    country: string | null;
    lat: number | null;
    lon: number | null;
  };
}

export interface SecurityDTO {
  security_id: string;
  ticker_symbol: string;
  name: string;
  type: (typeof SECURITY_TYPES)[number];
  close_price: number;
  close_price_as_of: string;
  isin: string | null;
  cusip: string | null;
  exchange: string | null;
  iso_currency_code: string;
}

export interface HoldingDTO {
  account_id: string;
  security_id: string;
  quantity: number;
  institution_price: number;
  institution_price_as_of: string;
  institution_value: number;
  cost_basis: number;
  iso_currency_code: string;
}

export interface InvestmentTransactionDTO {
  investment_transaction_id: string;
  account_id: string;
  security_id: string;
  date: string;
  name: string;
  type: (typeof INVESTMENT_TX_TYPES)[number];
  quantity: number;
  price: number;
  amount: number;
  fees: number;
  iso_currency_code: string;
}

export interface ItemStatusDTO {
  item_id: string;
  institution_id: string;
  status: (typeof ITEM_STATUSES)[number];
  consent_expires_at: string | null;
  products: string[];
  webhook: string | null;
}

export interface WebhookPayload {
  webhook_type: string;
  webhook_code: (typeof WEBHOOK_EVENT_CODES)[number];
  item_id: string;
  environment: (typeof ENVIRONMENTS)[number];
  [key: string]: unknown;
}
