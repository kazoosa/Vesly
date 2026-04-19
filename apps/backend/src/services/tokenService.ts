import { sha256Hex, randomToken } from "../utils/crypto.js";
import { config } from "../config.js";

export function issueAccessToken(): { raw: string; hash: string } {
  const raw = `access-${config.ENVIRONMENT}-${randomToken(24)}`;
  return { raw, hash: sha256Hex(raw) };
}

export function hashAccessToken(raw: string): string {
  return sha256Hex(raw);
}
