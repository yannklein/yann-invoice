import { isAllowedEmail } from '@/lib/auth/allow';
import { json, mcpEnabled, notFound, oauthError, preflight } from '@/lib/mcp/config';
import { ACCESS_TTL, clientSecret, markCodeUsed, open, REFRESH_TTL, seal, verifyClient, verifyPkce, type Grant } from '@/lib/mcp/tokens';

async function readBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, String(v)]));
  }
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

function basicAuth(req: Request): { id: string; secret: string } | null {
  const m = req.headers.get('authorization')?.match(/^Basic\s+(\S+)$/i);
  if (!m) return null;
  const [id, ...rest] = Buffer.from(m[1], 'base64').toString().split(':');
  return { id: decodeURIComponent(id), secret: decodeURIComponent(rest.join(':')) };
}

/** OAuth token endpoint: exchanges a one-time code (with PKCE) or a refresh token for a fresh access + refresh token pair. */
export async function POST(req: Request) {
  if (!mcpEnabled()) return notFound();
  const body = await readBody(req);
  const basic = basicAuth(req);
  const clientId = basic?.id ?? body.client_id;
  const client = clientId ? await verifyClient(clientId) : null;
  if (!client) return oauthError('invalid_client', 'Unknown client', 401);
  if (client.auth !== 'none' && (basic?.secret ?? body.client_secret) !== clientSecret(clientId)) return oauthError('invalid_client', 'Bad client secret', 401);

  let grant: Grant;
  if (body.grant_type === 'authorization_code') {
    let code: Grant & { exp: number };
    try {
      code = await open('code', body.code ?? '');
    } catch {
      return oauthError('invalid_grant', 'The code is invalid or expired');
    }
    if (!code.jti || !markCodeUsed(code.jti, code.exp)) return oauthError('invalid_grant', 'The code was already used');
    if (code.cid !== clientId || code.ruri !== body.redirect_uri) return oauthError('invalid_grant', 'The code was issued to another client or redirect_uri');
    if (!body.code_verifier || !verifyPkce(body.code_verifier, code.cc ?? '')) return oauthError('invalid_grant', 'PKCE verification failed');
    grant = code;
  } else if (body.grant_type === 'refresh_token') {
    try {
      grant = await open('refresh', body.refresh_token ?? '');
    } catch {
      return oauthError('invalid_grant', 'The refresh token is invalid or expired');
    }
    if (grant.cid !== clientId) return oauthError('invalid_grant', 'The refresh token was issued to another client');
  } else {
    return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token');
  }
  if (!isAllowedEmail(grant.sub, process.env.ALLOWED_EMAIL)) return oauthError('invalid_grant', 'This account is no longer allowed');

  const keep: Grant = { sub: grant.sub, grt: grant.grt, cid: grant.cid };
  return json({
    access_token: await seal('access', keep, ACCESS_TTL),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL,
    refresh_token: await seal('refresh', keep, REFRESH_TTL),
  });
}

export const OPTIONS = preflight;
