import { describe, it, expect } from "vitest";
import { previewCsv } from "../src/services/csvImportService.js";

/**
 * Real-world Fidelity export shape (Apr 2026 download). Every awkward
 * row from the user's file is represented here so a regression on any
 * one of them lights up immediately.
 */
const FIDELITY_FIXTURE =
  "﻿Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type\n" +
  // Plain equity
  'X77787572,Individual - TOD,AMAT,APPLIED MATERIALS INC,100,$402.93,-$0.55,$40293.00,-$55.00,-0.14%,+$3890.50,+10.68%,19.37%,$36402.50,$364.03,Margin,\n' +
  // Short call (negative qty, leading-space symbol)
  'X77787572,Individual - TOD, -AMAT260424C400,AMAT APR 24 2026 $400 CALL,-1,$9.15,-$1.40,-$915.00,+$140.00,+13.27%,-$185.69,-25.47%,-0.44%,$729.31,$7.29,Margin,\n' +
  // Pending activity row (no symbol/quantity, negative current value)
  'X77787572,Individual - TOD,Pending activity,,,,,-$121472.97,,,,,,\n' +
  // Money-market sweep (no qty/price, real Current Value)
  'X96522210,Individual - TOD,SPAXX**,HELD IN MONEY MARKET,,,,$0.04,,,,,100.00%,,,Cash,\n' +
  // Money-market in another account, big balance
  '237179178,"ROLLOVER IRA-27,000",SPAXX**,HELD IN MONEY MARKET,,,,$30824.62,,,,,28.84%,,,Cash,\n' +
  // Same ticker twice in one account (Margin + Cash). Aggregation happens
  // downstream in importPositionsCsv; the parser should emit both rows.
  '237179178,"ROLLOVER IRA-27,000",ATAI,ATAIBECKLEY INC,300,$4.77,+$0.06,$1431.00,+$18.00,+1.27%,+$44.05,+3.17%,1.34%,$1386.95,$4.62,Margin,\n' +
  '237179178,"ROLLOVER IRA-27,000",ATAI,ATAIBECKLEY INC,1000,$4.77,+$0.06,$4770.00,+$60.00,+1.27%,-$1663.95,-25.87%,4.46%,$6433.95,$6.43,Cash,\n' +
  // FDIC-insured cash sweep (different keyword path)
  '226160950,Health Savings Account,CORE**,FDIC-INSURED DEPOSIT SWEEP,,,,$204.97,,,,,12.82%,,,Cash,\n' +
  // Footer disclaimer rows (Fidelity legal text)
  '"The data and information in this spreadsheet is provided to you solely for your use and is not for distribution. The spreadsheet is provided for informational purposes only..."\n' +
  '"Date downloaded Apr-23-2026 1:39 p.m ET"\n';

describe("parseFidelity (real-world export shape)", () => {
  const result = previewCsv("fidelity", FIDELITY_FIXTURE);

  it("groups by account number, not by name", () => {
    // Two accounts share the name "Individual - TOD" but have different
    // account numbers — must be kept separate.
    const masks = result.map((r) => r.accountMask).sort();
    expect(masks).toContain("7572"); // X77787572
    expect(masks).toContain("2210"); // X96522210
    expect(masks).toContain("9178"); // 237179178
    expect(masks).toContain("0950"); // 226160950
  });

  it("imports money-market sweeps as cash positions, not as $0", () => {
    const ira = result.find((r) => r.accountMask === "9178")!;
    const spaxx = ira.positions.find((p) => p.ticker === "SPAXX**");
    expect(spaxx).toBeDefined();
    expect(spaxx!.quantity).toBeCloseTo(30824.62, 2);
    expect(spaxx!.price).toBe(1);
    expect(spaxx!.type).toBe("cash");
  });

  it("preserves the leading-space option ticker after trim", () => {
    const acct = result.find((r) => r.accountMask === "7572")!;
    const opt = acct.positions.find((p) => p.ticker === "-AMAT260424C400");
    expect(opt).toBeDefined();
    expect(opt!.quantity).toBe(-1); // short position
  });

  it("merges same-ticker rows in the same account into one position", () => {
    // ATAI appears twice for account 237179178 (Margin lot of 300 +
    // Cash lot of 1000). Beacon's schema is one holding per
    // (account, security), so the parser must combine lots BEFORE the
    // importer ever sees them — otherwise the inserter trips the
    // unique constraint and the user sees the misleading "duplicate
    // rows for accountId, securityId" error. Merge math: total qty 1300,
    // weighted avg cost = (300*$4.62 + 1000*$6.43) / 1300 ≈ $6.01.
    const ira = result.find((r) => r.accountMask === "9178")!;
    const ataiRows = ira.positions.filter((p) => p.ticker === "ATAI");
    expect(ataiRows).toHaveLength(1);
    expect(ataiRows[0]!.quantity).toBe(1300);
    expect(ataiRows[0]!.avgCost).toBeCloseTo((300 * 4.62 + 1000 * 6.43) / 1300, 2);
  });

  it("skips pending-activity rows entirely", () => {
    const acct = result.find((r) => r.accountMask === "7572")!;
    const pending = acct.positions.find((p) => /pending/i.test(p.ticker));
    expect(pending).toBeUndefined();
  });

  it("ignores Fidelity's footer disclaimer text rows", () => {
    // Disclaimer rows would have created junk positions with no real
    // ticker; they must produce nothing.
    const allTickers = result.flatMap((r) => r.positions.map((p) => p.ticker));
    expect(allTickers.some((t) => t.includes("THE DATA"))).toBe(false);
    expect(allTickers.some((t) => t.includes("DATE DOWNLOADED"))).toBe(false);
  });

  it("handles quoted account names with commas", () => {
    const ira = result.find((r) => r.accountName.includes("ROLLOVER IRA-27,000"));
    expect(ira).toBeDefined();
  });

  it("handles the BOM on the header row without choking", () => {
    // If BOM stripping broke, "Account Number" wouldn't match and we'd
    // get zero accounts back.
    expect(result.length).toBeGreaterThan(0);
  });
});
