import { prisma } from "../db.js";
import { signLinkToken, signPublicToken, verifyLinkToken } from "../utils/jwt.js";
import { Errors } from "../utils/errors.js";

/**
 * Creates a link session + signed link_token.
 */
export async function createLinkSession(args: {
  applicationId: string;
  clientUserId: string;
  products: string[];
  clientName: string;
  webhookUrl?: string;
  redirectUri?: string;
}) {
  const { applicationId, clientUserId, products, clientName, webhookUrl, redirectUri } = args;
  const { token, jti } = signLinkToken({
    app_id: applicationId,
    client_user_id: clientUserId,
    products,
    client_name: clientName,
    webhook: webhookUrl,
    redirect_uri: redirectUri,
  });

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const session = await prisma.linkSession.create({
    data: {
      applicationId,
      linkTokenJti: jti,
      clientUserId,
      products,
      clientName,
      webhookUrl: webhookUrl ?? null,
      redirectUri: redirectUri ?? null,
      expiresAt,
    },
  });
  return { linkToken: token, sessionId: session.id, expiration: expiresAt.toISOString() };
}

export async function resolveSessionByLinkToken(linkToken: string) {
  let claims;
  try {
    claims = verifyLinkToken(linkToken);
  } catch {
    throw Errors.invalidLinkToken();
  }
  const session = await prisma.linkSession.findUnique({
    where: { linkTokenJti: claims.jti },
    include: { application: true, institution: true },
  });
  if (!session) throw Errors.invalidLinkToken();
  if (session.expiresAt < new Date()) throw Errors.invalidLinkToken();
  return session;
}

export async function finalizeSession(sessionId: string) {
  const session = await prisma.linkSession.findUnique({ where: { id: sessionId } });
  if (!session) throw Errors.notFound("Session");
  if (!session.institutionId) throw Errors.badRequest("Institution not selected");
  if (session.selectedAccountIds.length === 0) throw Errors.badRequest("No accounts selected");

  const { token: publicToken, jti } = signPublicToken({
    link_session_id: session.id,
    institution_id: session.institutionId,
    account_ids: session.selectedAccountIds,
  });

  await prisma.linkSession.update({
    where: { id: sessionId },
    data: { status: "COMPLETED", publicTokenJti: jti },
  });

  return { publicToken, sessionId: session.id };
}
