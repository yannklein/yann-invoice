import { baseUrl, json, mcpEnabled, notFound, preflight, resourceUrl } from '@/lib/mcp/config';

/** RFC 9728: Claude finds the authorization server here (at the root and at /api/mcp). */
export function GET() {
  if (!mcpEnabled()) return notFound();
  return json({ resource: resourceUrl(), authorization_servers: [baseUrl()], bearer_methods_supported: ['header'], resource_name: 'yann·finance' });
}

export const OPTIONS = preflight;
