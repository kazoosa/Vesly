import { Faker, en } from "@faker-js/faker";
import { MERCHANTS, CITIES } from "../constants/merchants.js";

// Loose structural types for Prisma createMany inputs — avoids depending on the
// generated `Prisma.XxxCreateManyInput` namespace which can vary between versions.
type AccountInput = {
  id: string;
  itemId: string;
  name: string;
  officialName: string | null;
  mask: string;
  type: string;
  subtype: string;
  currentBalance: number;
  availableBalance: number | null;
  limitBalance: number | null;
  isoCurrencyCode: string;
};
type TransactionInput = {
  id: string;
  accountId: string;
  amount: number;
  isoCurrencyCode: string;
  date: Date;
  authorizedDate: Date | null;
  name: string;
  merchantName: string | null;
  categoryPrimary: string;
  categoryDetailed: string;
  categoryId: string | null;
  pending: boolean;
  paymentChannel: string;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
};
type IdentityInput = {
  itemId: string;
  names: string[];
  emails: string[];
  phones: string[];
  addressLine: string;
  addressCity: string;
  addressRegion: string;
  addressPostal: string;
  addressCountry: string;
};
type PayStub = { pay_period_start: string; pay_period_end: string; gross: number; net: number };
type IncomeInput = {
  itemId: string;
  employerName: string;
  payFrequency: string;
  projectedYearlyIncome: number;
  ytdGrossIncome: number;
  payStubs: PayStub[];
};

function seededFaker(seed: string): Faker {
  const f = new Faker({ locale: [en] });
  // Derive a stable numeric seed from the string
  let n = 0;
  for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  f.seed(n);
  return f;
}

export interface GenerateAccountsArgs {
  itemId: string;
  products: string[];
}

export interface GeneratedAccount {
  data: AccountInput;
  role: "checking" | "savings" | "credit" | "brokerage";
}

export function generateAccounts({ itemId, products }: GenerateAccountsArgs): GeneratedAccount[] {
  const f = seededFaker(`${itemId}:accounts`);
  const hasInvest = products.includes("investments");

  const accounts: GeneratedAccount[] = [];
  const checking: AccountInput = {
    id: `acc_${f.string.alphanumeric(12)}`,
    itemId,
    name: "Checking",
    officialName: "Everyday Checking",
    mask: f.string.numeric(4),
    type: "depository",
    subtype: "checking",
    currentBalance: +f.number.float({ min: 500, max: 8000, fractionDigits: 2 }).toFixed(2),
    availableBalance: null,
    limitBalance: null,
    isoCurrencyCode: "USD",
  };
  checking.availableBalance = (checking.currentBalance as number) - f.number.int({ min: 0, max: 120 });
  accounts.push({ data: checking, role: "checking" });

  const savings: AccountInput = {
    id: `acc_${f.string.alphanumeric(12)}`,
    itemId,
    name: "Savings",
    officialName: "High-Yield Savings",
    mask: f.string.numeric(4),
    type: "depository",
    subtype: "savings",
    currentBalance: +f.number.float({ min: 2000, max: 45000, fractionDigits: 2 }).toFixed(2),
    availableBalance: null,
    limitBalance: null,
    isoCurrencyCode: "USD",
  };
  savings.availableBalance = savings.currentBalance as number;
  accounts.push({ data: savings, role: "savings" });

  if (f.number.int({ min: 0, max: 10 }) > 3) {
    const credit: AccountInput = {
      id: `acc_${f.string.alphanumeric(12)}`,
      itemId,
      name: "Credit Card",
      officialName: "Rewards Credit Card",
      mask: f.string.numeric(4),
      type: "credit",
      subtype: "credit card",
      currentBalance: +f.number.float({ min: 100, max: 3500, fractionDigits: 2 }).toFixed(2),
      availableBalance: null,
      limitBalance: 10000,
      isoCurrencyCode: "USD",
    };
    accounts.push({ data: credit, role: "credit" });
  }

  if (hasInvest) {
    const brokerage: AccountInput = {
      id: `acc_${f.string.alphanumeric(12)}`,
      itemId,
      name: "Brokerage",
      officialName: "Individual Brokerage Account",
      mask: f.string.numeric(4),
      type: "investment",
      subtype: "brokerage",
      currentBalance: 0,
      availableBalance: 0,
      limitBalance: null,
      isoCurrencyCode: "USD",
    };
    accounts.push({ data: brokerage, role: "brokerage" });
  }

  return accounts;
}

export interface GenerateTransactionsArgs {
  itemId: string;
  accountId: string;
  accountRole: "checking" | "savings" | "credit";
  days?: number;
  startDate?: Date;
}

export function generateTransactions({
  itemId,
  accountId,
  accountRole,
  days = 90,
  startDate,
}: GenerateTransactionsArgs): TransactionInput[] {
  const f = seededFaker(`${itemId}:${accountId}:tx`);
  const txs: TransactionInput[] = [];

  const end = startDate ?? new Date();
  const start = new Date(end.getTime() - days * 24 * 3600 * 1000);

  const mweights: number[] = [];
  let total = 0;
  for (const m of MERCHANTS) {
    total += m.frequency;
    mweights.push(total);
  }
  const pickMerchant = () => {
    const r = f.number.int({ min: 1, max: total });
    for (let i = 0; i < mweights.length; i++) {
      if (r <= mweights[i]!) return MERCHANTS[i]!;
    }
    return MERCHANTS[0]!;
  };

  for (let day = 0; day < days; day++) {
    const date = new Date(start.getTime() + day * 24 * 3600 * 1000);
    // Number of transactions that day — higher for checking/credit
    const base = accountRole === "savings" ? 0 : 1;
    const count = base + f.number.int({ min: 0, max: accountRole === "credit" ? 4 : 3 });

    for (let i = 0; i < count; i++) {
      const m = pickMerchant();
      // Payroll / transfers for checking only
      if (accountRole !== "checking" && m.categoryDetailed === "Payroll") continue;
      if (accountRole === "credit" && m.categoryDetailed === "Payroll") continue;
      const amt = +f.number
        .float({ min: m.amountRange[0], max: m.amountRange[1], fractionDigits: 2 })
        .toFixed(2);
      const city = f.helpers.arrayElement(CITIES);
      const pending = day >= days - 2 && f.number.int({ min: 0, max: 10 }) > 7;

      txs.push({
        id: `tx_${f.string.alphanumeric(20)}`,
        accountId,
        amount: amt,
        isoCurrencyCode: "USD",
        date,
        authorizedDate: pending ? null : date,
        name: m.name,
        merchantName: m.name,
        categoryPrimary: m.categoryPrimary,
        categoryDetailed: m.categoryDetailed,
        categoryId: null,
        pending,
        paymentChannel: m.paymentChannel,
        addressLine: m.paymentChannel === "in store" ? f.location.streetAddress() : null,
        city: city.city,
        region: city.region,
        postalCode: f.location.zipCode(),
        country: "US",
        lat: city.lat,
        lon: city.lon,
      });
    }
  }
  return txs;
}

export function generateIdentity(itemId: string): IdentityInput {
  const f = seededFaker(`${itemId}:identity`);
  const first = f.person.firstName();
  const last = f.person.lastName();
  const city = f.helpers.arrayElement(CITIES);
  return {
    itemId,
    names: [`${first} ${last}`],
    emails: [f.internet.email({ firstName: first, lastName: last }).toLowerCase()],
    phones: [f.phone.number()],
    addressLine: f.location.streetAddress(),
    addressCity: city.city,
    addressRegion: city.region,
    addressPostal: f.location.zipCode(),
    addressCountry: "US",
  };
}

export function generateIncome(itemId: string): IncomeInput {
  const f = seededFaker(`${itemId}:income`);
  const projected = +f.number.float({ min: 52000, max: 180000, fractionDigits: 2 }).toFixed(2);
  const ytd = +(projected * f.number.float({ min: 0.2, max: 0.75 })).toFixed(2);
  const payStubs = Array.from({ length: 3 }).map((_, i) => ({
    pay_period_start: f.date.recent({ days: 30 * (i + 1) }).toISOString().slice(0, 10),
    pay_period_end: f.date.recent({ days: 30 * i + 14 }).toISOString().slice(0, 10),
    gross: +(projected / 24).toFixed(2),
    net: +(projected / 24 * 0.72).toFixed(2),
  }));
  return {
    itemId,
    employerName: f.company.name(),
    payFrequency: "SEMI_MONTHLY",
    projectedYearlyIncome: projected,
    ytdGrossIncome: ytd,
    payStubs,
  };
}
