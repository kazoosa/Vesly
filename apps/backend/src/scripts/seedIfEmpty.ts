import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * On boot, ensure the demo developer exists AND has a healthy portfolio
 * (items + holdings). The previous version only counted Items — which
 * let a partial-seed state (Items present, zero InvestmentHoldings)
 * pass as "already seeded" and left every subsequent boot stuck with
 * an empty demo dashboard forever.
 *
 * This version:
 *   1. If the demo developer doesn't exist, runs the full prisma seed.
 *   2. If the demo developer exists but has zero holdings, delegates
 *      to seedDemoPortfolioForDeveloper(), which deletes empty items,
 *      upserts institutions/securities, and re-creates the 4-brokerage
 *      portfolio end-to-end.
 *   3. If the demo developer already has holdings, no-op.
 *
 * Runs via dist/scripts/seedIfEmpty.js in the Docker entrypoint.
 */
async function main() {
  const demoEmail = "demo@finlink.dev";

  const demo = await prisma.developer.findUnique({
    where: { email: demoEmail },
    select: { id: true },
  });

  // Case 1: demo developer doesn't exist → full seed (creates dev +
  // institutions + securities + items).
  if (!demo) {
    console.log("[seedIfEmpty] demo account missing — running full seed");
    await prisma.$disconnect();
    await import("../prisma/seed.js");
    return;
  }

  // Case 2/3: demo developer exists. Check for healthy holdings
  // (holdings are linked to items via Account, so we have to join).
  const apps = await prisma.application.findMany({
    where: { developerId: demo.id },
    select: { id: true },
  });
  const items = apps.length
    ? await prisma.item.findMany({
        where: { applicationId: { in: apps.map((a: { id: string }) => a.id) } },
        select: { id: true },
      })
    : [];

  let holdingsCount = 0;
  if (items.length > 0) {
    holdingsCount = await prisma.investmentHolding.count({
      where: { account: { itemId: { in: items.map((i: { id: string }) => i.id) } } },
    });
  }

  if (holdingsCount > 0) {
    console.log(
      `[seedIfEmpty] demo healthy — items=${items.length}, holdings=${holdingsCount} — skipping seed`,
    );
    await prisma.$disconnect();
    return;
  }

  // Partial / broken state: items exist but no holdings (or no items
  // at all but the developer is here). Self-heal.
  console.log(
    `[seedIfEmpty] demo partial — items=${items.length}, holdings=${holdingsCount} — running self-heal seed`,
  );
  const { seedDemoPortfolioForDeveloper } = await import(
    "../services/demoSeedService.js"
  );
  const t0 = Date.now();
  const result = await seedDemoPortfolioForDeveloper(demo.id, demoEmail);
  console.log(
    `[seedIfEmpty] done created=${result.created} items=${result.itemCount} in ${Date.now() - t0}ms`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[seedIfEmpty] failed:", e);
  // Don't block server startup — the app still boots, just without a
  // re-seeded demo. A subsequent deploy or manual seed can fix it.
  process.exit(0);
});
