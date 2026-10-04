export async function refreshGoogleToken(refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Token refresh failed (${res.status})`);
  return {
    accessToken: body.access_token as string,
    expiresAt: Math.floor(Date.now() / 1000) + (body.expires_in as number),
    refreshToken: body.refresh_token as string | undefined,
  };
}
