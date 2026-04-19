import jwt, { type SignOptions } from "jsonwebtoken";
import { nanoid } from "nanoid";
import { config } from "../config.js";

export interface DeveloperJwtClaims {
  sub: string; // developer id
  email: string;
  jti: string;
  type: "access" | "refresh";
}

export interface LinkTokenClaims {
  jti: string;
  app_id: string;
  client_user_id: string;
  products: string[];
  client_name: string;
  redirect_uri?: string;
  webhook?: string;
}

export interface PublicTokenClaims {
  jti: string;
  link_session_id: string;
  institution_id: string;
  account_ids: string[];
}

export function signDeveloperAccess(sub: string, email: string): string {
  return jwt.sign(
    { sub, email, type: "access", jti: nanoid() } satisfies Omit<DeveloperJwtClaims, "jti"> & { jti: string },
    config.JWT_SECRET,
    { expiresIn: "15m" } as SignOptions,
  );
}

export function signDeveloperRefresh(sub: string, email: string): { token: string; jti: string } {
  const jti = nanoid();
  const token = jwt.sign(
    { sub, email, type: "refresh", jti } as DeveloperJwtClaims,
    config.JWT_SECRET,
    { expiresIn: "30d" } as SignOptions,
  );
  return { token, jti };
}

export function verifyDeveloperToken(token: string): DeveloperJwtClaims {
  return jwt.verify(token, config.JWT_SECRET) as DeveloperJwtClaims;
}

export function signLinkToken(claims: Omit<LinkTokenClaims, "jti">): { token: string; jti: string } {
  const jti = nanoid();
  const token = jwt.sign(
    { ...claims, jti } as LinkTokenClaims,
    config.LINK_TOKEN_SECRET,
    { expiresIn: "30m" } as SignOptions,
  );
  return { token, jti };
}

export function verifyLinkToken(token: string): LinkTokenClaims {
  return jwt.verify(token, config.LINK_TOKEN_SECRET) as LinkTokenClaims;
}

export function signPublicToken(claims: Omit<PublicTokenClaims, "jti">): { token: string; jti: string } {
  const jti = nanoid();
  const token = jwt.sign(
    { ...claims, jti } as PublicTokenClaims,
    config.LINK_TOKEN_SECRET,
    { expiresIn: "30m" } as SignOptions,
  );
  return { token, jti };
}

export function verifyPublicToken(token: string): PublicTokenClaims {
  return jwt.verify(token, config.LINK_TOKEN_SECRET) as PublicTokenClaims;
}
