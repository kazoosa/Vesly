import { prisma } from "../db.js";

export async function getIdentityForItem(itemId: string) {
  const id = await prisma.identity.findUnique({ where: { itemId } });
  if (!id) return null;
  return {
    item_id: itemId,
    names: id.names,
    emails: id.emails.map((data: string) => ({ data, primary: false, type: "home" })),
    phone_numbers: id.phones.map((data: string) => ({ data, primary: false, type: "mobile" })),
    addresses: [
      {
        primary: true,
        data: {
          street: id.addressLine,
          city: id.addressCity,
          region: id.addressRegion,
          postal_code: id.addressPostal,
          country: id.addressCountry,
        },
      },
    ],
  };
}
