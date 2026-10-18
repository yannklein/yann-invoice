import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { todayDate } from '@/lib/dashboard/period';
import { authenticate, unauthorized } from '@/lib/mcp/auth';
import { CORS, mcpEnabled, notFound, preflight } from '@/lib/mcp/config';
import { googleFromRefreshToken } from '@/lib/mcp/google';
import { createServer } from '@/lib/mcp/tools';

const withCors = (res: Response) => {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

/** Streamable HTTP, stateless: every JSON-RPC request gets its own server, authenticated by the bearer token. */
export async function POST(req: Request) {
  if (!mcpEnabled()) return notFound();
  const grant = await authenticate(req);
  if (grant instanceof Response) return grant;
  let google;
  try {
    google = await googleFromRefreshToken(grant.grt);
  } catch {
    return unauthorized('invalid_token', 'Google access was revoked or expired: reconnect');
  }
  const server = createServer(google, todayDate(), grant.sub);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return withCors(await transport.handleRequest(req));
}

const noStream = () => (mcpEnabled() ? new Response('Method not allowed', { status: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' } }) : notFound());
export const GET = noStream;
export const DELETE = noStream;
export const OPTIONS = preflight;
