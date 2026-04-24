import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchOptionQuotes, batchSymbols, TradierError } from "../src/services/tradierClient.js";

const ORIGINAL_FETCH = globalThis.fetch;

describe("batchSymbols", () => {
  it("splits long symbol lists into 50-char batches by default", () => {
    const symbols = Array.from({ length: 137 }, (_, i) => `SYM${i}`);
    const batches = batchSymbols(symbols);
    expect(batches).toHaveLength(3); // 50 + 50 + 37
    expect(batches[0]).toHaveLength(50);
    expect(batches[1]).toHaveLength(50);
    expect(batches[2]).toHaveLength(37);
  });
  it("accepts a custom batch size", () => {
    expect(batchSymbols(["A", "B", "C", "D", "E"], 2)).toEqual([
      ["A", "B"],
      ["C", "D"],
      ["E"],
    ]);
  });
  it("returns empty array on empty input", () => {
    expect(batchSymbols([])).toEqual([]);
  });
});

describe("fetchOptionQuotes — happy path", () => {
  beforeEach(() => {
    process.env.TRADIER_TOKEN = "test-token";
    process.env.TRADIER_BASE_URL = "https://sandbox.test/v1";
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete process.env.TRADIER_TOKEN;
    delete process.env.TRADIER_BASE_URL;
  });

  it("strips OCC padding spaces before sending to Tradier and matches results back to canonical form", async () => {
    let capturedUrl = "";
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(
        JSON.stringify({
          quotes: {
            quote: [
              {
                symbol: "AAPL250117C00200000",
                description: "AAPL Jan 17 2025 $200 Call",
                last: 8.5,
                bid: 8.4,
                ask: 8.6,
                greeks: {
                  delta: 0.55,
                  gamma: 0.04,
                  theta: -0.08,
                  vega: 0.21,
                  mid_iv: 0.32,
                  updated_at: "2026-04-25T15:30:00",
                },
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const out = await fetchOptionQuotes(["AAPL  250117C00200000"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      symbol: "AAPL  250117C00200000", // canonical (padded) form preserved
      last: 8.5,
      bid: 8.4,
      ask: 8.6,
      delta: 0.55,
      gamma: 0.04,
      theta: -0.08,
      vega: 0.21,
      iv: 0.32,
      greeksAsOf: "2026-04-25T15:30:00",
    });
    // Padded canonical was unpadded for the request URL
    expect(capturedUrl).toContain("AAPL250117C00200000");
    expect(capturedUrl).not.toContain("AAPL%20%20");
  });

  it("returns empty-quote placeholders for symbols Tradier didn't return", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          quotes: {
            quote: [
              {
                symbol: "AAPL250117C00200000",
                last: 8.5,
                greeks: { delta: 0.5, mid_iv: 0.3, updated_at: "2026-04-25T15:30:00" },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const out = await fetchOptionQuotes([
      "AAPL  250117C00200000",
      "MSFT  250117C00400000",
    ]);
    expect(out).toHaveLength(2);
    const aapl = out.find((q) => q.symbol.includes("AAPL"))!;
    const msft = out.find((q) => q.symbol.includes("MSFT"))!;
    expect(aapl.last).toBe(8.5);
    expect(aapl.delta).toBe(0.5);
    // Missing symbol fills as null placeholders so the caller can match
    // by index without losing track of which contract failed.
    expect(msft.last).toBeNull();
    expect(msft.delta).toBeNull();
    expect(msft.greeksAsOf).toBeNull();
  });

  it("handles Tradier's single-quote (object instead of array) response shape", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          quotes: {
            quote: {
              symbol: "AAPL250117C00200000",
              last: 9,
              greeks: { delta: 0.6, mid_iv: 0.31, updated_at: "2026-04-25T15:30:00" },
            },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const out = await fetchOptionQuotes(["AAPL  250117C00200000"]);
    expect(out).toHaveLength(1);
    expect(out[0]!.last).toBe(9);
  });

  it("handles Tradier's 'no quotes' empty-response sentinel", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ quotes: "no quotes" }), { status: 200 }),
    ) as unknown as typeof fetch;

    const out = await fetchOptionQuotes(["AAPL  250117C00200000"]);
    expect(out).toHaveLength(1);
    expect(out[0]!.last).toBeNull();
  });

  it("falls back to smv_vol when mid_iv is missing", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          quotes: {
            quote: {
              symbol: "AAPL250117C00200000",
              last: 5,
              greeks: { delta: 0.4, smv_vol: 0.27, updated_at: "x" },
            },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const out = await fetchOptionQuotes(["AAPL  250117C00200000"]);
    expect(out[0]!.iv).toBe(0.27);
  });
});

describe("fetchOptionQuotes — error paths", () => {
  beforeEach(() => {
    process.env.TRADIER_TOKEN = "test-token";
    process.env.TRADIER_BASE_URL = "https://sandbox.test/v1";
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete process.env.TRADIER_TOKEN;
    delete process.env.TRADIER_BASE_URL;
  });

  it("throws TradierError with status 429 on rate-limit response", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("rate limit exceeded", { status: 429 }),
    ) as unknown as typeof fetch;

    await expect(fetchOptionQuotes(["AAPL  250117C00200000"])).rejects.toMatchObject({
      name: "TradierError",
      status: 429,
    });
  });

  it("throws TradierError with status 401 on auth failure", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("forbidden", { status: 401 }),
    ) as unknown as typeof fetch;

    await expect(fetchOptionQuotes(["AAPL  250117C00200000"])).rejects.toMatchObject({
      name: "TradierError",
      status: 401,
    });
  });
});

describe("fetchOptionQuotes — env var safety", () => {
  it("returns null-greek placeholders (no crash) when TRADIER_TOKEN is unset", async () => {
    const out = await fetchOptionQuotes(["AAPL  250117C00200000"]);
    expect(out).toHaveLength(1);
    expect(out[0]!.delta).toBeNull();
    expect(out[0]!.iv).toBeNull();
  });

  it("returns empty array on empty input without making any HTTP call", async () => {
    let called = false;
    globalThis.fetch = vi.fn(async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const out = await fetchOptionQuotes([]);
    expect(out).toEqual([]);
    expect(called).toBe(false);
    globalThis.fetch = ORIGINAL_FETCH;
  });
});

describe("TradierError", () => {
  it("is an instance of Error and carries the status code", () => {
    const err = new TradierError("boom", 503);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("TradierError");
    expect(err.status).toBe(503);
  });
});
