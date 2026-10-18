import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { describe, expect, it, vi } from 'vitest';
import type { FinanceData } from '@/lib/advisor/load';
import type { Google } from '@/lib/google/client';
import { FX, inv } from './fixtures/dashboard';

const data: FinanceData = {
  rows: [inv('a', { number: '202609001', clientName: 'Le Wagon', subtotal: 3000, total: 3420 })],
  failed: 0, settings: { irpfRate: 0.07, defaultTerms: 'Due upon receipt' }, shared: null, fx: FX, invest: null,
};
const loadFinance = vi.fn(async () => data);
vi.mock('@/lib/advisor/load', () => ({ loadFinance: () => loadFinance() }));
const { createServer } = await import('@/lib/mcp/tools');

/** One JSON-RPC call through a fresh stateless server, as /api/mcp does it. */
async function rpc(method: string, params: Record<string, unknown> = {}, user = 'u1') {
  const server = createServer({} as Google, '2026-10-17', user);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }));
  return res.json();
}

describe('MCP server', () => {
  it('initializes with instructions', async () => {
    const r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    expect(r.result.serverInfo.name).toBe('yann-finance');
    expect(r.result.instructions).toContain('get_snapshot first');
  });
  it('lists five read-only tools', async () => {
    const r = await rpc('tools/list');
    expect(r.result.tools.map((t: { name: string }) => t.name)).toEqual(['get_snapshot', 'list_invoices', 'tax_quarters', 'household', 'portfolio']);
    expect(r.result.tools.every((t: { annotations: { readOnlyHint: boolean } }) => t.annotations.readOnlyHint)).toBe(true);
  });
  it('runs tools on the loaded data, sharing one load per user for a while', async () => {
    loadFinance.mockClear();
    const snap = await rpc('tools/call', { name: 'get_snapshot', arguments: {} });
    expect(snap.result.content[0].text).toContain('# Finance snapshot · 2026-10-17');
    const tax = await rpc('tools/call', { name: 'tax_quarters', arguments: { year: 2026 } });
    expect(tax.result.content[0].text).toContain('| Q3 | 2026-10-20 |');
    expect((await rpc('tools/call', { name: 'portfolio', arguments: {} })).result.content[0].text).toBe('No portfolio sheet is linked.');
    expect(loadFinance).toHaveBeenCalledTimes(1);
  });
  it('validates arguments', async () => {
    const r = await rpc('tools/call', { name: 'list_invoices', arguments: { from: '2026-13' } }, 'u2');
    expect(r.result?.isError ?? !!r.error).toBe(true);
  });
  it('reports load failures as tool errors', async () => {
    loadFinance.mockRejectedValueOnce(new Error('The app is not set up yet'));
    const r = await rpc('tools/call', { name: 'get_snapshot', arguments: {} }, 'u3');
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toContain('not set up');
  });
});
