import { isAllowedEmail } from '@/lib/auth/allow';
import { CORS, resourceMetadataUrl } from './config';
import { open, type Grant } from './tokens';

/** 401 that points Claude at the OAuth metadata, so it (re)starts the sign-in flow. */
export function unauthorized(error?: string, description?: string): Response {
  const params = [`resource_metadata="${resourceMetadataUrl()}"`, ...(error ? [`error="${error}"`] : []), ...(description ? [`error_description="${description}"`] : [])];
  return new Response(JSON.stringify({ error: error ?? 'unauthorized' }), {
    status: 401,
    headers: { ...CORS, 'Content-Type': 'application/json', 'WWW-Authenticate': `Bearer ${params.join(', ')}` },
  });
}

/** The grant behind a request's bearer token, or the 401 to send back. */
export async function authenticate(req: Request): Promise<Grant | Response> {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return unauthorized();
  let grant: Grant;
  try {
    grant = await open('access', token);
  } catch {
    return unauthorized('invalid_token', 'The access token is invalid or expired');
  }
  if (!isAllowedEmail(grant.sub, process.env.ALLOWED_EMAIL)) return unauthorized('invalid_token', 'This account is no longer allowed');
  return grant;
}
