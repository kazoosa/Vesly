import type { AccountDTO } from "@finlink/shared";
import { prisma } from "../db.js";

type AccountShape = NonNullable<Awaited<ReturnType<typeof prisma.account.findUnique>>>;

export function toAccountDTO(a: AccountShape): AccountDTO {
  return {
    account_id: a.id,
    item_id: a.itemId,
    mask: a.mask,
    name: a.name,
    official_name: a.officialName,
    type: a.type as AccountDTO["type"],
    subtype: a.subtype as AccountDTO["subtype"],
    balances: {
      current: a.currentBalance,
      available: a.availableBalance,
      limit: a.limitBalance,
      iso_currency_code: a.isoCurrencyCode,
    },
  };
}

export async function listAccountsByItem(itemId: string): Promise<AccountDTO[]> {
  const rows = await prisma.account.findMany({ where: { itemId }, orderBy: { createdAt: "asc" } });
  return rows.map((r: AccountShape) => toAccountDTO(r));
}

export async function refreshBalances(itemId: string): Promise<AccountDTO[]> {
  // In sandbox we just "touch" balances — return current rows.
  return listAccountsByItem(itemId);
}
