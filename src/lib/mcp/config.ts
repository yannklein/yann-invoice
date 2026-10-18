/** The MCP connector is on only when both are set; otherwise its endpoints answer 404 (rotate or unset MCP_SECRET to cut Claude off). */
export const mcpEnabled = () => !!process.env.MCP_SECRET && !!process.env.AUTH_URL;

/** The public origin. Behind Coolify `req.url` is the container's own address, so it always comes from AUTH_URL. */
export const baseUrl = () => new URL(process.env.AUTH_URL!).origin;
export const resourceUrl = () => `${baseUrl()}/api/mcp`;
export const resourceMetadataUrl = () => `${baseUrl()}/.well-known/oauth-protected-resource/api/mcp`;

const CLAUDE_CALLBACKS = new Set(['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback']);

/** Claude's web callback, or a loopback address on any port (Claude Code, MCP Inspector). */
export function isAllowedRedirect(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === 'https:') return CLAUDE_CALLBACKS.has(`${u.origin}${u.pathname}`) && !u.search;
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
};

export const notFound = () => new Response('Not found', { status: 404 });
export const preflight = () => new Response(null, { status: 204, headers: CORS });
export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...CORS, 'Cache-Control': 'no-store', ...headers } });

/** An RFC 6749 error response. */
export const oauthError = (error: string, description: string, status = 400) => json({ error, error_description: description }, status);
