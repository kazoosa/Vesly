import { prisma } from "../db.js";

export async function listInstitutions(opts: { query?: string; count?: number; offset?: number } = {}) {
  const { query, count = 50, offset = 0 } = opts;
  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { routingNumbers: { has: query } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    prisma.institution.findMany({ where, orderBy: { name: "asc" }, skip: offset, take: count }),
    prisma.institution.count({ where }),
  ]);
  return { institutions: rows, total };
}

export async function getInstitution(id: string) {
  return prisma.institution.findUnique({ where: { id } });
}
