import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dev = await prisma.developer.count();
  if (dev === 0) {
    // eslint-disable-next-line no-console
    console.log("[seedIfEmpty] no developers — running seed");
    await prisma.$disconnect();
    await import("../prisma/seed.js");
  } else {
    // eslint-disable-next-line no-console
    console.log("[seedIfEmpty] developers exist — skipping seed");
    await prisma.$disconnect();
  }
}

main();
