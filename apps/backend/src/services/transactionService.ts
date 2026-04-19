import type { TransactionDTO } from "@finlink/shared";
import { prisma } from "../db.js";

type TransactionShape = NonNullable<Awaited<ReturnType<typeof prisma.transaction.findUnique>>>;

export function toTransactionDTO(t: TransactionShape): TransactionDTO {
  return {
    transaction_id: t.id,
    account_id: t.accountId,
    amount: t.amount,
    iso_currency_code: t.isoCurrencyCode,
    date: t.date.toISOString().slice(0, 10),
    authorized_date: t.authorizedDate ? t.authorizedDate.toISOString().slice(0, 10) : null,
    name: t.name,
    merchant_name: t.merchantName,
    category: [t.categoryPrimary, t.categoryDetailed],
    category_id: t.categoryId,
    pending: t.pending,
    payment_channel: t.paymentChannel as TransactionDTO["payment_channel"],
    location: {
      address: t.addressLine,
      city: t.city,
      region: t.region,
      postal_code: t.postalCode,
      country: t.country,
      lat: t.lat,
      lon: t.lon,
    },
  };
}

export interface ListArgs {
  itemId: string;
  startDate?: Date;
  endDate?: Date;
  accountId?: string;
  category?: string;
  count: number;
  offset?: number;
}

export async function listTransactions({
  itemId,
  startDate,
  endDate,
  accountId,
  category,
  count,
  offset = 0,
}: ListArgs) {
  const accounts = await prisma.account.findMany({ where: { itemId }, select: { id: true } });
  const accIds = accounts.map((a: { id: string }) => a.id);
  const where = {
    accountId: accountId ? accountId : { in: accIds },
    ...(startDate || endDate
      ? { date: { gte: startDate ?? undefined, lte: endDate ?? undefined } }
      : {}),
    ...(category
      ? { OR: [{ categoryPrimary: category }, { categoryDetailed: category }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: offset,
      take: count,
    }),
    prisma.transaction.count({ where }),
  ]);
  return { transactions: rows.map((r: TransactionShape) => toTransactionDTO(r)), total };
}

/**
 * Cursor-based sync. Cursor encodes the position as base64 of "<iso>|<id>".
 * Returns up to `count` rows after the cursor (by date DESC, id DESC) as `added`.
 * `removed` comes from TransactionTombstone rows created since the cursor.
 */
export async function syncTransactions(itemId: string, cursor: string | undefined, count: number) {
  const accounts = await prisma.account.findMany({ where: { itemId }, select: { id: true } });
  const accIds = accounts.map((a: { id: string }) => a.id);

  let cursorDate: Date | null = null;
  let cursorId: string | null = null;
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, "base64url").toString("utf8");
      const [iso, id] = decoded.split("|");
      if (iso && id) {
        cursorDate = new Date(iso);
        cursorId = id;
      }
    } catch {
      /* invalid cursor — start from beginning */
    }
  }

  const whereAdded = {
    accountId: { in: accIds },
    ...(cursorDate
      ? {
          OR: [
            { date: { gt: cursorDate } },
            { AND: [{ date: cursorDate }, { id: { gt: cursorId ?? "" } }] },
          ],
        }
      : {}),
  };

  const rows = await prisma.transaction.findMany({
    where: whereAdded,
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: count + 1,
  });

  const hasMore = rows.length > count;
  const added = (hasMore ? rows.slice(0, count) : rows).map((r: TransactionShape) => toTransactionDTO(r));

  const removedRows = cursorDate
    ? await prisma.transactionTombstone.findMany({
        where: { itemId, removedAt: { gt: cursorDate } },
      })
    : [];
  const removed = removedRows.map((r: { transactionId: string }) => ({ transaction_id: r.transactionId }));

  let nextCursor = cursor ?? "";
  const last = hasMore ? rows[count - 1] : rows[rows.length - 1];
  if (last) {
    nextCursor = Buffer.from(`${last.date.toISOString()}|${last.id}`, "utf8").toString("base64url");
  }

  return {
    added,
    modified: [], // not modeled in sandbox
    removed,
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

export async function injectSimulatedTransactions(
  itemId: string,
  accountId: string | undefined,
  count: number,
) {
  const accounts = await prisma.account.findMany({
    where: { itemId, ...(accountId ? { id: accountId } : {}), type: { in: ["depository", "credit"] } },
    select: { id: true, type: true, subtype: true },
  });
  if (accounts.length === 0) return 0;
  const target = accounts[Math.floor(Math.random() * accounts.length)]!;
  const role =
    target.type === "credit"
      ? ("credit" as const)
      : target.subtype === "savings"
      ? ("savings" as const)
      : ("checking" as const);

  const { generateTransactions } = await import("../utils/mockDataGenerator.js");
  const now = new Date();
  const all = generateTransactions({
    itemId: `${itemId}:sim:${now.getTime()}`,
    accountId: target.id,
    accountRole: role,
    days: 1,
    startDate: now,
  });
  const picked = all.slice(0, count);
  if (picked.length > 0) {
    await prisma.transaction.createMany({ data: picked });
  }
  return picked.length;
}
