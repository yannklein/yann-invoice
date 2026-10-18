import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { isAllowedRedirect } from '@/lib/mcp/config';
import { clientSecret, markCodeUsed, open, seal, signClient, verifyClient, verifyPkce, type Grant } from '@/lib/mcp/tokens';

const grant: Grant = { sub: 'me@example.com', grt: 'google-refresh', cid: 'client' };

beforeEach(() => {
  process.env.MCP_SECRET = 'test-secret-test-secret-test-secret';
  process.env.AUTH_URL = 'https://invoice.example.com';
});

describe('sealed tokens', () => {
  it('round-trips a grant', async () => {
    const t = await seal('access', grant, 60);
    expect(await open('access', t)).toMatchObject(grant);
  });
  it('does not show the Google refresh token in clear', async () => {
    const t = await seal('access', grant, 60);
    expect(t).not.toContain('google-refresh');
    expect(Buffer.from(t.split('.')[0], 'base64url').toString()).toContain('A256GCM');
  });
  it('rejects a token of another type', async () => {
    await expect(open('access', await seal('refresh', grant, 60))).rejects.toThrow();
    await expect(open('refresh', await seal('code', grant, 60))).rejects.toThrow();
  });
  it('rejects an expired token', async () => {
    await expect(open('access', await seal('access', grant, -10))).rejects.toThrow();
  });
  it('rejects a tampered token', async () => {
    const t = await seal('access', grant, 60);
    const parts = t.split('.');
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('AA') ? 'BB' : 'AA');
    await expect(open('access', parts.join('.'))).rejects.toThrow();
  });
  it('rejects a token for another server', async () => {
    const t = await seal('access', grant, 60);
    process.env.AUTH_URL = 'https://other.example.com';
    await expect(open('access', t)).rejects.toThrow();
  });
  it('rejects every token once MCP_SECRET changes', async () => {
    const t = await seal('access', grant, 60);
    process.env.MCP_SECRET = 'another-secret-another-secret-another';
    await expect(open('access', t)).rejects.toThrow();
  });
});

describe('clients', () => {
  it('verifies its own registrations only', async () => {
    const id = await signClient({ redirect_uris: ['http://localhost:6274/oauth/callback'], auth: 'none' });
    expect(await verifyClient(id)).toMatchObject({ redirect_uris: ['http://localhost:6274/oauth/callback'] });
    expect(await verifyClient(id.slice(0, -3) + 'abc')).toBeNull();
    expect(await verifyClient('nope')).toBeNull();
  });
  it('derives a stable secret per client', () => {
    expect(clientSecret('a')).toBe(clientSecret('a'));
    expect(clientSecret('a')).not.toBe(clientSecret('b'));
  });
});

describe('PKCE', () => {
  const verifier = 'a'.repeat(43);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  it('accepts the matching verifier', () => expect(verifyPkce(verifier, challenge)).toBe(true));
  it('rejects a wrong or malformed verifier', () => {
    expect(verifyPkce('b'.repeat(43), challenge)).toBe(false);
    expect(verifyPkce('short', challenge)).toBe(false);
  });
});

describe('codes', () => {
  it('can be used once', () => {
    const exp = Date.now() / 1000 + 60;
    expect(markCodeUsed('j1', exp)).toBe(true);
    expect(markCodeUsed('j1', exp)).toBe(false);
  });
});

describe('isAllowedRedirect', () => {
  it.each([
    ['https://claude.ai/api/mcp/auth_callback', true],
    ['https://claude.com/api/mcp/auth_callback', true],
    ['http://localhost:6274/oauth/callback', true],
    ['http://127.0.0.1:33418/callback', true],
    ['https://claude.ai/api/mcp/auth_callback?x=1', false],
    ['https://evil.example/api/mcp/auth_callback', false],
    ['https://claude.ai.evil.example/api/mcp/auth_callback', false],
    ['http://claude.ai/api/mcp/auth_callback', false],
    ['javascript:alert(1)', false],
    ['not a url', false],
  ])('%s → %s', (uri, ok) => expect(isAllowedRedirect(uri)).toBe(ok));
});
