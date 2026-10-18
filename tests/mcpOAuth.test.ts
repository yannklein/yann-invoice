import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as register } from '@/app/oauth/register/route';
import { POST as token } from '@/app/oauth/token/route';
import { validateAuthorize } from '@/lib/mcp/authorize';
import { CODE_TTL, open, seal } from '@/lib/mcp/tokens';

const REDIRECT = 'http://localhost:6274/oauth/callback';
const verifier = 'v'.repeat(50);
const challenge = createHash('sha256').update(verifier).digest('base64url');

beforeEach(() => {
  process.env.MCP_SECRET = 'test-secret-test-secret-test-secret';
  process.env.AUTH_URL = 'https://invoice.example.com';
  process.env.ALLOWED_EMAIL = 'me@example.com';
});

const post = (url: string, body: string, type: string, headers: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', body, headers: { 'content-type': type, ...headers } });

async function registerClient(extra: Record<string, unknown> = {}) {
  const res = await register(post('https://x/oauth/register', JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Inspector', ...extra }), 'application/json'));
  return { status: res.status, body: await res.json() };
}

let n = 0;
const codeFor = (cid: string, over: Record<string, string> = {}) =>
  seal('code', { sub: 'me@example.com', grt: 'google-refresh', cid, ruri: REDIRECT, cc: challenge, jti: `j${n++}`, ...over }, CODE_TTL);

const exchange = (params: Record<string, string>, headers: Record<string, string> = {}) =>
  token(post('https://x/oauth/token', new URLSearchParams(params).toString(), 'application/x-www-form-urlencoded', headers));

describe('register', () => {
  it('registers a loopback client without storing anything', async () => {
    const { status, body } = await registerClient();
    expect(status).toBe(201);
    expect(body.token_endpoint_auth_method).toBe('none');
    expect(body.client_secret).toBeUndefined();
  });
  it('refuses other redirect URIs', async () => {
    const res = await register(post('https://x/oauth/register', JSON.stringify({ redirect_uris: ['https://evil.example/cb'] }), 'application/json'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_redirect_uri');
  });
  it('gives a secret to clients that ask for one', async () => {
    const { body } = await registerClient({ token_endpoint_auth_method: 'client_secret_post' });
    expect(body.client_secret).toEqual(expect.any(String));
  });
  it('is off without MCP_SECRET', async () => {
    delete process.env.MCP_SECRET;
    const res = await register(post('https://x/oauth/register', JSON.stringify({ redirect_uris: [REDIRECT] }), 'application/json'));
    expect(res.status).toBe(404);
  });
});

describe('authorize request', () => {
  it('accepts a registered client with PKCE', async () => {
    const { body } = await registerClient();
    const v = await validateAuthorize({ response_type: 'code', client_id: body.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 's' });
    expect(v).toMatchObject({ ok: true, req: { clientName: 'Inspector', state: 's' } });
  });
  it('rejects an unregistered redirect, missing PKCE or another resource', async () => {
    const { body } = await registerClient();
    const base = { response_type: 'code', client_id: body.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256' };
    expect((await validateAuthorize({ ...base, redirect_uri: 'http://localhost:1/other' })).ok).toBe(false);
    expect((await validateAuthorize({ ...base, code_challenge_method: 'plain' })).ok).toBe(false);
    expect((await validateAuthorize({ ...base, resource: 'https://elsewhere/api/mcp' })).ok).toBe(false);
    expect((await validateAuthorize({ ...base, resource: 'https://invoice.example.com/api/mcp' })).ok).toBe(true);
  });
});

describe('token', () => {
  it('exchanges a code once, then refreshes', async () => {
    const { body: client } = await registerClient();
    const code = await codeFor(client.client_id);
    const params = { grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: verifier };
    const res = await exchange(params);
    expect(res.status).toBe(200);
    const t = await res.json();
    expect(t).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
    expect(await open('access', t.access_token)).toMatchObject({ sub: 'me@example.com', grt: 'google-refresh' });

    const again = await exchange(params);
    expect((await again.json()).error).toBe('invalid_grant');

    const refreshed = await exchange({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: client.client_id });
    expect(refreshed.status).toBe(200);
    expect(await open('access', (await refreshed.json()).access_token)).toMatchObject({ grt: 'google-refresh' });
  });
  it('rejects a wrong verifier, redirect_uri or client', async () => {
    const { body: client } = await registerClient();
    const { body: other } = await registerClient({ client_name: 'Other' }); // identical registrations get the same stateless id
    const base = { grant_type: 'authorization_code', client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: verifier };
    expect((await (await exchange({ ...base, code: await codeFor(client.client_id), code_verifier: 'w'.repeat(50) })).json()).error).toBe('invalid_grant');
    expect((await (await exchange({ ...base, code: await codeFor(client.client_id), redirect_uri: 'http://localhost:1/x' })).json()).error).toBe('invalid_grant');
    expect((await (await exchange({ ...base, code: await codeFor(other.client_id) })).json()).error).toBe('invalid_grant');
  });
  it('does not accept an access token as a refresh token', async () => {
    const { body: client } = await registerClient();
    const access = await seal('access', { sub: 'me@example.com', grt: 'g', cid: client.client_id }, 60);
    expect((await (await exchange({ grant_type: 'refresh_token', refresh_token: access, client_id: client.client_id })).json()).error).toBe('invalid_grant');
  });
  it('stops once the email is no longer allowed', async () => {
    const { body: client } = await registerClient();
    const refresh = await seal('refresh', { sub: 'me@example.com', grt: 'g', cid: client.client_id }, 60);
    process.env.ALLOWED_EMAIL = 'someone@example.com';
    expect((await (await exchange({ grant_type: 'refresh_token', refresh_token: refresh, client_id: client.client_id })).json()).error).toBe('invalid_grant');
  });
  it('checks the secret of confidential clients (post and basic)', async () => {
    const { body: client } = await registerClient({ token_endpoint_auth_method: 'client_secret_basic' });
    const refresh = await seal('refresh', { sub: 'me@example.com', grt: 'g', cid: client.client_id }, 60);
    const params = { grant_type: 'refresh_token', refresh_token: refresh };
    expect((await exchange({ ...params, client_id: client.client_id })).status).toBe(401);
    expect((await exchange({ ...params, client_id: client.client_id, client_secret: client.client_secret })).status).toBe(200);
    const basic = Buffer.from(`${encodeURIComponent(client.client_id)}:${encodeURIComponent(client.client_secret)}`).toString('base64');
    expect((await exchange(params, { authorization: `Basic ${basic}` })).status).toBe(200);
  });
});
