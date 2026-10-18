import { createHash, createHmac, hkdfSync } from 'node:crypto';
import { EncryptJWT, jwtDecrypt, jwtVerify, SignJWT } from 'jose';
import { resourceUrl } from './config';

export type TokenType = 'code' | 'access' | 'refresh';

/** What Claude was allowed: whose data (sub), with which Google refresh token (grt), for which registered client (cid). */
export interface Grant {
  sub: string;
  grt: string;
  cid: string;
  ruri?: string; // code only: the redirect_uri it was issued for
  cc?: string; // code only: the PKCE S256 challenge
  jti?: string; // code only: one-time use
}

export const ACCESS_TTL = 3600;
export const REFRESH_TTL = 90 * 86_400;
export const CODE_TTL = 60;

/** One key per use, derived from MCP_SECRET, so a token of one type can never pass as another. */
const key = (use: TokenType | 'client') => new Uint8Array(hkdfSync('sha256', process.env.MCP_SECRET!, 'yann-invoice-mcp', `mcp:${use}`, 32));

/**
 * Tokens are encrypted (not just signed): each one carries the Google refresh token. Nothing is stored server-side,
 * so the only ways to revoke them are their expiry, rotating MCP_SECRET, or revoking the app in the Google account.
 */
export async function seal(typ: TokenType, grant: Grant, ttlSec: number): Promise<string> {
  return new EncryptJWT({ ...grant, typ })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
    .setAudience(resourceUrl())
    .encrypt(key(typ));
}

/** The grant inside a token of type `typ`; throws when it is of another type, expired, tampered with or for another server. */
export async function open(typ: TokenType, token: string): Promise<Grant & { exp: number }> {
  const { payload } = await jwtDecrypt(token, key(typ), { audience: resourceUrl() });
  if (payload.typ !== typ || typeof payload.sub !== 'string' || typeof payload.grt !== 'string' || typeof payload.cid !== 'string') {
    throw new Error('Malformed token');
  }
  return payload as unknown as Grant & { exp: number };
}

export interface ClientMeta {
  redirect_uris: string[];
  client_name?: string;
  /** 'none' for public clients; otherwise the client gets a secret derived from its id. */
  auth: 'none' | 'client_secret_post' | 'client_secret_basic';
}

/** Dynamic client registration without storage: the client id is the signed registration itself. */
export const signClient = (meta: ClientMeta) => new SignJWT({ ...meta }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().sign(key('client'));

export async function verifyClient(clientId: string): Promise<ClientMeta | null> {
  try {
    const { payload } = await jwtVerify(clientId, key('client'));
    return Array.isArray(payload.redirect_uris) ? (payload as unknown as ClientMeta) : null;
  } catch {
    return null;
  }
}

export const clientSecret = (clientId: string) => createHmac('sha256', key('client')).update(clientId).digest('base64url');

const b64url = (b: Buffer) => b.toString('base64url');

/** PKCE, S256 only. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return b64url(createHash('sha256').update(verifier).digest()) === challenge;
}

const usedCodes = new Map<string, number>();

/** True the first time a code id is seen (the app runs as one container, so memory is enough). */
export function markCodeUsed(jti: string, exp: number): boolean {
  const now = Date.now() / 1000;
  for (const [id, until] of usedCodes) if (until < now) usedCodes.delete(id);
  if (usedCodes.has(jti)) return false;
  usedCodes.set(jti, exp);
  return true;
}
