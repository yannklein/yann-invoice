import { randomUUID } from 'node:crypto';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { isAllowedEmail } from '@/lib/auth/allow';
import { validateAuthorize } from '@/lib/mcp/authorize';
import { baseUrl, mcpEnabled, notFound } from '@/lib/mcp/config';
import { CODE_TTL, seal } from '@/lib/mcp/tokens';

/** The consent form posts here: on Allow, hand Claude a one-time code that wraps the session's Google refresh token. */
export async function POST(req: NextRequest) {
  if (!mcpEnabled()) return notFound();
  // Only the consent page on this origin may approve (the session cookie is SameSite=Lax as well).
  if (req.headers.get('origin') !== baseUrl()) return new Response('Forbidden', { status: 403 });
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const v = await validateAuthorize(params);
  if (!v.ok) return new Response(v.error, { status: 400 });

  const back = new URL(v.req.redirectUri);
  if (v.req.state) back.searchParams.set('state', v.req.state);
  back.searchParams.set('iss', baseUrl());
  if (params.decision !== 'allow') {
    back.searchParams.set('error', 'access_denied');
    return Response.redirect(back, 303);
  }

  // Read server-side from the encrypted session cookie: the refresh token is never exposed to the browser.
  const token = await getToken({ req, secret: process.env.AUTH_SECRET!, secureCookie: baseUrl().startsWith('https:') });
  if (!token?.email || !isAllowedEmail(token.email, process.env.ALLOWED_EMAIL)) return new Response('Sign in first.', { status: 401 });
  if (!token.refreshToken) return new Response('No Google refresh token in this session: sign out, sign in again, then retry.', { status: 409 });

  const code = await seal('code', { sub: token.email, grt: token.refreshToken, cid: v.req.clientId, ruri: v.req.redirectUri, cc: v.req.codeChallenge, jti: randomUUID() }, CODE_TTL);
  back.searchParams.set('code', code);
  return Response.redirect(back, 303);
}
