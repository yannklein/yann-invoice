import { createHash } from 'node:crypto';
import { refreshGoogleToken } from '@/lib/auth/refresh';
import { googleFromAccessToken, type Google } from '@/lib/google/client';

const cache = new Map<string, { accessToken: string; expiresAt: number }>();

/** A Google client from the refresh token inside an MCP grant; access tokens are reused until a minute before they expire. */
export async function googleFromRefreshToken(refreshToken: string): Promise<Google> {
  const id = createHash('sha256').update(refreshToken).digest('hex');
  const now = Date.now() / 1000;
  let hit = cache.get(id);
  if (!hit || hit.expiresAt - 60 < now) {
    const t = await refreshGoogleToken(refreshToken);
    hit = { accessToken: t.accessToken, expiresAt: t.expiresAt };
    cache.set(id, hit);
  }
  return googleFromAccessToken(hit.accessToken);
}
