import { describe, it, expect } from "vitest";
import { previewActivityCsv } from "../src/services/csvImportService.js";

/**
 * The activity CSV importer derives end-of-history holdings by replaying
 * every transaction (BUY adds shares + cost basis, SELL subtracts at
 * average cost, fees subtract cash, dividends/interest add cash). Without
 * this replay, an activity-only import created InvestmentTransaction
 * rows but ZERO InvestmentHolding rows, so the user's hundreds of
 * trades summed to "\$0 in stocks" everywhere outside the Accounts
 * page. The replay logic itself is internal to importActivityCsv (it
 * needs a Prisma transaction to actually persist), so this test
 * exercises the parser + classifier hand-off that feeds it: every
 * action label this code path depends on must classify correctly.
 */

const FIDELITY_ACTIVITY_FIXTURE = [
  "Run Date,Account,Action,Symbol,Description,Quantity,Price,Commission,Fees,Amount,Settlement Date",
  // Two buys of AAPL — total 30 shares at avg cost \$160
  '01/05/2025,X12345,YOU BOUGHT,AAPL,APPLE INC,10,$150.00,$0.00,$0.00,-$1500.00,01/07/2025',
  '02/10/2025,X12345,YOU BOUGHT,AAPL,APPLE INC,20,$165.00,$0.00,$0.00,-$3300.00,02/12/2025',
  // One partial sell — 5 shares
  '03/15/2025,X12345,YOU SOLD,AAPL,APPLE INC,5,$170.00,$0.00,$0.00,$850.00,03/17/2025',
  // Dividend (cash only — does NOT change shares)
  '04/01/2025,X12345,DIVIDEND RECEIVED,AAPL,APPLE INC,0,$0.00,$0.00,$0.00,$25.00,04/01/2025',
  // Reinvested dividend (classifier maps to "buy" so DOES add shares)
  '04/01/2025,X12345,REINVESTMENT,AAPL,APPLE INC,1,$170.00,$0.00,$0.00,-$170.00,04/01/2025',
  // Fee (subtract from cash, no share change)
  '04/15/2025,X12345,ACCOUNT FEE,,FEE,,,,$1.00,-$1.00,04/15/2025',
  // Different ticker — buy and full sell, ends with zero shares
  '05/01/2025,X12345,YOU BOUGHT,MSFT,MICROSOFT,5,$300.00,$0.00,$0.00,-$1500.00,05/03/2025',
  '06/01/2025,X12345,YOU SOLD,MSFT,MICROSOFT,5,$320.00,$0.00,$0.00,$1600.00,06/03/2025',
].join("\n");

describe("Fidelity activity → derived holdings (parse + classify pipeline)", () => {
  const activities = previewActivityCsv("fidelity", FIDELITY_ACTIVITY_FIXTURE);

  it("classifies every action so the replay sees the right type", () => {
    const types = activities.map((a) => a.type).sort();
    // Two buys + one reinvestment (mapped to buy) + one buy MSFT = 4 buys
    expect(types.filter((t) => t === "buy")).toHaveLength(4);
    expect(types.filter((t) => t === "sell")).toHaveLength(2);
    expect(types.filter((t) => t === "dividend")).toHaveLength(1);
    expect(types.filter((t) => t === "fee")).toHaveLength(1);
  });

  it("preserves quantity and price for share-moving transactions", () => {
    const aaplBuys = activities.filter((a) => a.ticker === "AAPL" && a.type === "buy");
    expect(aaplBuys.length).toBeGreaterThanOrEqual(2);
    const tenShareBuy = aaplBuys.find((a) => a.quantity === 10);
    expect(tenShareBuy).toBeDefined();
    expect(tenShareBuy!.price).toBe(150);
  });

  it("preserves the absolute amount on buys (sign decided downstream)", () => {
    const buy = activities.find(
      (a) => a.ticker === "AAPL" && a.type === "buy" && a.quantity === 10,
    );
    // Parser strips the leading "-" via Math.abs so the importer can
    // sign the cash leg by type. The expected positive amount is what
    // the share-replay relies on for cost basis.
    expect(buy!.amount).toBe(1500);
  });

  it("captures dividend amounts without quantity (cash leg only)", () => {
    const div = activities.find((a) => a.type === "dividend");
    expect(div!.quantity).toBe(0);
    expect(div!.amount).toBe(25);
  });
});
