import { baseUrl, json, mcpEnabled, notFound, preflight } from '@/lib/mcp/config';

/** RFC 8414 metadata of the app's own authorization server for the MCP connector. */
export function GET() {
  if (!mcpEnabled()) return notFound();
  const base = baseUrl();
  return json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    authorization_response_iss_parameter_supported: true,
  });
}

export const OPTIONS = preflight;
