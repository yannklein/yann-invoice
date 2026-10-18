import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { AUTHORIZE_PARAMS, validateAuthorize } from '@/lib/mcp/authorize';
import { mcpEnabled } from '@/lib/mcp/config';
import { Panel } from '../../dashboard/ui';

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!mcpEnabled()) notFound();
  const raw = await searchParams;
  const params: Record<string, string> = {};
  for (const k of AUTHORIZE_PARAMS) {
    const v = raw[k];
    if (v !== undefined) params[k] = Array.isArray(v) ? v[0] : v;
  }
  const v = await validateAuthorize(params);
  // Never redirect on a bad client or redirect_uri: the page would become an open redirect.
  if (!v.ok) {
    return (
      <Panel title="Cannot connect">
        <p className="text-sm">{v.error}</p>
      </Panel>
    );
  }
  const session = await auth();
  if (!session?.user) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(params)}`)}`);

  return (
    <div className="mx-auto max-w-lg">
      <Panel title="Connect Claude">
        <form method="post" action="/oauth/authorize/approve" className="space-y-4 text-sm">
          <p>
            <b>{v.req.clientName ?? 'An MCP client'}</b> wants <b>read-only</b> access to your finances: invoices, tax quarters, the shared account and
            your portfolio.
          </p>
          <p className="text-foreground/60">
            It will answer to {new URL(v.req.redirectUri).origin}. Access lasts until you rotate <code>MCP_SECRET</code> or revoke the app in your Google
            account. Signed in as {session.user.email}.
          </p>
          {Object.entries(params).map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}
          <div className="flex gap-2">
            <Button type="submit" name="decision" value="allow">Allow</Button>
            <Button type="submit" name="decision" value="deny" variant="outline">Deny</Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
