import { Faker, en } from "@faker-js/faker";

type HoldingInput = {
  accountId: string;
  securityId: string;
  quantity: number;
  institutionPrice: number;
  institutionPriceAsOf: Date;
  institutionValue: number;
  costBasis: number;
  isoCurrencyCode: string;
};
type InvTxInput = {
  accountId: string;
  securityId: string;
  date: Date;
  name: string;
  type: string;
  quantity: number;
  price: number;
  amount: number;
  fees: number;
  isoCurrencyCode: string;
};

function seededFaker(seed: string): Faker {
  const f = new Faker({ locale: [en] });
  let n = 0;
  for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  f.seed(n);
  return f;
}

export interface SecurityRef {
  id: string;
  tickerSymbol: string;
  name: string;
  closePrice: number;
  paysDividend: boolean;
}

export interface GenerateInvestmentsArgs {
  itemId: string;
  accountId: string;
  securities: SecurityRef[];
}

export interface GeneratedInvestments {
  holdings: HoldingInput[];
  transactions: InvTxInput[];
  totalValue: number;
}

export function generateInvestments({
  itemId,
  accountId,
  securities,
}: GenerateInvestmentsArgs): GeneratedInvestments {
  const f = seededFaker(`${itemId}:${accountId}:inv`);
  const count = f.number.int({ min: 5, max: Math.min(15, securities.length) });
  const chosen = f.helpers.arrayElements(securities, count);

  const holdings: HoldingInput[] = [];
  const transactions: InvTxInput[] = [];
  let totalValue = 0;

  const now = new Date();
  const priceAsOf = new Date(now.getTime() - 24 * 3600 * 1000);

  for (const sec of chosen) {
    const quantity = +f.number.float({ min: 1, max: 150, fractionDigits: 4 }).toFixed(4);
    const avgCost = +(sec.closePrice * f.number.float({ min: 0.55, max: 1.1 })).toFixed(2);
    const costBasis = +(avgCost * quantity).toFixed(2);
    const institutionValue = +(sec.closePrice * quantity).toFixed(2);
    totalValue += institutionValue;

    holdings.push({
      accountId,
      securityId: sec.id,
      quantity,
      institutionPrice: sec.closePrice,
      institutionPriceAsOf: priceAsOf,
      institutionValue,
      costBasis,
      isoCurrencyCode: "USD",
    });

    // Generate a series of BUYs + a couple SELLs over the past 12 months
    let remaining = quantity;
    const buys = f.number.int({ min: 2, max: 6 });
    const buyQty = +(quantity / buys).toFixed(4);
    for (let b = 0; b < buys; b++) {
      const date = f.date.past({ years: 1, refDate: now });
      const price = +(avgCost * f.number.float({ min: 0.9, max: 1.1 })).toFixed(2);
      transactions.push({
        accountId,
        securityId: sec.id,
        date,
        name: `Buy ${sec.tickerSymbol}`,
        type: "buy",
        quantity: buyQty,
        price,
        amount: +(buyQty * price).toFixed(2),
        fees: 0,
        isoCurrencyCode: "USD",
      });
      remaining -= buyQty;
    }
    // Sells — at least one rebalancing sell per security
    const sellCount = f.number.int({ min: 1, max: 2 });
    for (let s = 0; s < sellCount; s++) {
      if (remaining <= 0.5) break;
      const date = f.date.past({ years: 1, refDate: now });
      const sellQty = +(buyQty * f.number.float({ min: 0.25, max: 0.6 })).toFixed(4);
      const price = +(sec.closePrice * f.number.float({ min: 0.85, max: 1.12 })).toFixed(2);
      transactions.push({
        accountId,
        securityId: sec.id,
        date,
        name: `Sell ${sec.tickerSymbol}`,
        type: "sell",
        quantity: sellQty,
        price,
        amount: +(sellQty * price).toFixed(2),
        fees: 0,
        isoCurrencyCode: "USD",
      });
    }
    // Dividends quarterly if it pays
    if (sec.paysDividend) {
      for (let q = 0; q < 4; q++) {
        const date = f.date.recent({ days: 90 * (q + 1) });
        const amt = +(institutionValue * 0.005).toFixed(2);
        transactions.push({
          accountId,
          securityId: sec.id,
          date,
          name: `${sec.tickerSymbol} Dividend`,
          type: "dividend",
          quantity: 0,
          price: 0,
          amount: amt,
          fees: 0,
          isoCurrencyCode: "USD",
        });
      }
    }
  }

  // --- Account-level activities (not per-security) ---
  // Attribute them to the first chosen security just so they have a valid FK.
  const cashSec = chosen[0];
  if (cashSec) {
    // Cash sweep interest — monthly, small amounts
    for (let m = 0; m < 12; m++) {
      const date = new Date(now.getTime() - m * 30 * 24 * 3600 * 1000);
      const amt = +f.number.float({ min: 0.3, max: 4.5, fractionDigits: 2 }).toFixed(2);
      transactions.push({
        accountId,
        securityId: cashSec.id,
        date,
        name: "Cash sweep interest",
        type: "interest",
        quantity: 0,
        price: 0,
        amount: amt,
        fees: 0,
        isoCurrencyCode: "USD",
      });
    }

    // Cash transfers — 3-5 deposits/withdrawals over the year
    const transferCount = f.number.int({ min: 3, max: 5 });
    for (let t = 0; t < transferCount; t++) {
      const date = f.date.past({ years: 1, refDate: now });
      const inflow = f.number.int({ min: 0, max: 10 }) > 3; // most are deposits
      const amt = +f.number.float({ min: 250, max: 5000, fractionDigits: 2 }).toFixed(2);
      transactions.push({
        accountId,
        securityId: cashSec.id,
        date,
        name: inflow ? "ACH deposit" : "ACH withdrawal",
        type: "transfer",
        quantity: 0,
        price: 0,
        amount: amt,
        fees: 0,
        isoCurrencyCode: "USD",
      });
    }

    // Occasional fees (account maintenance, wire, etc.)
    const feeCount = f.number.int({ min: 0, max: 3 });
    for (let fi = 0; fi < feeCount; fi++) {
      const date = f.date.past({ years: 1, refDate: now });
      const amt = +f.number.float({ min: 0.5, max: 25, fractionDigits: 2 }).toFixed(2);
      transactions.push({
        accountId,
        securityId: cashSec.id,
        date,
        name: f.helpers.arrayElement([
          "ADR fee",
          "Foreign tax withholding",
          "Wire transfer fee",
          "Paper statement fee",
        ]),
        type: "fee",
        quantity: 0,
        price: 0,
        amount: amt,
        fees: amt,
        isoCurrencyCode: "USD",
      });
    }
  }

  return { holdings, transactions, totalValue: +totalValue.toFixed(2) };
}
