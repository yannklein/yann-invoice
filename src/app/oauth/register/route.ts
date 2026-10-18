import { isAllowedRedirect, json, mcpEnabled, notFound, oauthError, preflight } from '@/lib/mcp/config';
import { clientSecret, signClient, type ClientMeta } from '@/lib/mcp/tokens';

const SECRET_METHODS = ['client_secret_post', 'client_secret_basic'];

/** RFC 7591 dynamic client registration. Nothing is stored: the client id is the signed registration. */
export async function POST(req: Request) {
  if (!mcpEnabled()) return notFound();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return oauthError('invalid_client_metadata', 'Expected a JSON body');
  }
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || !uris.every((u) => typeof u === 'string' && isAllowedRedirect(u))) {
    return oauthError('invalid_redirect_uri', 'Only Claude callbacks and loopback addresses are accepted');
  }
  const auth = (SECRET_METHODS.includes(String(body.token_endpoint_auth_method)) ? body.token_endpoint_auth_method : 'none') as ClientMeta['auth'];
  const name = typeof body.client_name === 'string' ? body.client_name.slice(0, 100) : undefined;
  const clientId = await signClient({ redirect_uris: uris as string[], client_name: name, auth });
  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: uris,
      client_name: name,
      token_endpoint_auth_method: auth,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      ...(auth === 'none' ? {} : { client_secret: clientSecret(clientId), client_secret_expires_at: 0 }),
    },
    201,
  );
}

export const OPTIONS = preflight;
