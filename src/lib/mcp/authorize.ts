import { isAllowedRedirect, resourceUrl } from './config';
import { verifyClient } from './tokens';

export interface AuthorizeRequest {
  clientId: string;
  clientName: string | null;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
}

/** The authorization request's parameters, checked the same way on the consent page and when it is approved. */
export async function validateAuthorize(p: Record<string, string | undefined>): Promise<{ ok: true; req: AuthorizeRequest } | { ok: false; error: string }> {
  if (p.response_type !== 'code') return { ok: false, error: 'Unsupported response_type (only "code").' };
  const client = p.client_id ? await verifyClient(p.client_id) : null;
  if (!client) return { ok: false, error: 'Unknown client: register it first.' };
  const redirectUri = p.redirect_uri ?? '';
  if (!client.redirect_uris.includes(redirectUri) || !isAllowedRedirect(redirectUri)) return { ok: false, error: 'This redirect_uri is not registered for the client.' };
  if (!p.code_challenge || p.code_challenge_method !== 'S256') return { ok: false, error: 'PKCE with S256 is required.' };
  if (p.resource && p.resource.replace(/\/$/, '') !== resourceUrl()) return { ok: false, error: `Unknown resource: ${p.resource}` };
  return { ok: true, req: { clientId: p.client_id!, clientName: client.client_name ?? null, redirectUri, codeChallenge: p.code_challenge, state: p.state ?? null } };
}

export const AUTHORIZE_PARAMS = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'] as const;
