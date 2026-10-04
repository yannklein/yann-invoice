import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAllowedEmail } from '@/lib/auth/allow';
import { refreshGoogleToken } from '@/lib/auth/refresh';

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({ authorization: { params: { scope: SCOPES, access_type: 'offline', prompt: 'consent' } } })],
  callbacks: {
    signIn({ profile }) {
      return profile?.email_verified === true && isAllowedEmail(profile.email, process.env.ALLOWED_EMAIL);
    },
    async jwt({ token, account }) {
      if (account) {
        return { ...token, accessToken: account.access_token, refreshToken: account.refresh_token, expiresAt: account.expires_at, error: undefined };
      }
      if (token.expiresAt && Date.now() < token.expiresAt * 1000 - 60_000) return token;
      if (!token.refreshToken) return { ...token, error: 'RefreshTokenError' };
      try {
        const t = await refreshGoogleToken(token.refreshToken);
        return { ...token, accessToken: t.accessToken, expiresAt: t.expiresAt, refreshToken: t.refreshToken ?? token.refreshToken, error: undefined };
      } catch {
        return { ...token, error: 'RefreshTokenError' };
      }
    },
    session({ session, token }) {
      // Single-user app: the token is only visible to its owner's own session.
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
});
