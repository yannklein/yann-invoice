# yann-invoice

Private invoice generator. Invoices are Google Sheets in the Drive folder `Invoices`;
`Invoice Index` in that folder is a cache the app rebuilds from them.

## Google Cloud setup (once)

1. console.cloud.google.com → new project "yann-invoice".
2. APIs & Services → Library → enable **Google Drive API** and **Google Sheets API**.
3. OAuth consent screen → External, app name "yann-invoice", add scopes `.../auth/drive` and `.../auth/spreadsheets`.
   **Publish the app ("In production")**. It stays unverified, which is fine for your own account.
   ("Testing" mode expires refresh tokens after 7 days.)
4. Credentials → Create OAuth client ID → Web application. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://invoice.yannklein.dev/api/auth/callback/google`
5. Copy the client ID and secret into `.env.local` (see `.env.example`). Generate `AUTH_SECRET` with `npx auth secret`.

Use the **same OAuth client** everywhere. The app finds its Drive folder, index and template through
`appProperties`, which are private to the OAuth client that wrote them.

## Develop

```bash
npm install
npm run dev    # http://localhost:3000
npm test
```

## First run

Sign in → Settings → review the list of legacy invoices → **Run setup**. This creates `Invoices`,
moves every `Invoice …` sheet into it (links keep working), creates `Invoice Template` (a copy of
202609003) and `Invoice Index`, then indexes everything (about 1 minute).

To change your sender details (address, Tax ID), edit `Invoice Template` in Google Sheets.

## Shared account (monthly transfer)

`/shared` works out how much goes to the shared account each month: income received (tick the invoices that reached
the bank, or add lines) minus expenses (copied from the previous month; instalments like `2598 € ÷ 3` move on by one
each month). Totals are in ¥ and €, using that month's JPY/EUR rate (default: today's ECB rate).

Data lives in the **Shared account money** sheet, tabs `Months` and `Lines`. Import it once from Settings → Shared
account: the old monthly tabs are converted (EUR is recovered from their `… * I1 / 1000` formulas) and left untouched.

## Dashboard

`/dashboard` charts what the app already knows: revenue by client, unpaid invoices (tracked from the first month that links
an invoice in `/shared`), quarterly VAT / IRPF / foreign withholding for Modelo 303/130 prep, and the
shared account's transfers and expenses. Amounts in other currencies use each month's ECB average (frankfurter.dev, cached
a day); switch € / ¥ and the period at the top. Expense categories come from keyword rules in `src/lib/dashboard/household.ts`.

## Ask Claude (snapshot and MCP connector)

`/snapshot` renders everything the app knows as one Markdown text (revenue and clients, unpaid invoices, tax quarters,
household months, money today, portfolio, plan and projection, and what the data does not cover). **Copy for Claude**
and paste it into a conversation.

To let Claude read it live, the app is also a read-only remote MCP server at `/api/mcp` with its own OAuth:

1. Set `MCP_SECRET` (`openssl rand -base64 32`) and `AUTH_URL` in the environment. Without them every MCP and OAuth
   endpoint answers 404.
2. Add the connector:
   - claude.ai → Settings → Connectors → Add custom connector → `https://invoice.yannklein.dev/api/mcp`
   - Claude Code: `claude mcp add --transport http yann-finance https://invoice.yannklein.dev/api/mcp`, then `/mcp`
3. Sign in with Google if asked, then **Allow** on the consent page.

Tools: `get_snapshot`, `list_invoices`, `tax_quarters`, `household`, `portfolio`. Nothing is stored server-side: Claude's
tokens are encrypted with `MCP_SECRET` and carry your Google refresh token (access 1 h, refresh 90 days). To cut Claude
off, rotate `MCP_SECRET` (your own sign-in is unaffected) or revoke the app in your Google account.

Local test: `npm run dev`, then `npx @modelcontextprotocol/inspector` with Streamable HTTP at `http://localhost:3000/api/mcp`.

## Deploy (Coolify)

1. Push this repo to GitHub (private).
2. Coolify → New resource → this repo → Build pack **Dockerfile**, port 3000, domain `invoice.yannklein.dev`.
3. Environment: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL`, `AUTH_TRUST_HOST=true`, `AUTH_URL=https://invoice.yannklein.dev`, and `MCP_SECRET` for the Claude connector.
4. Deploy. Confirm `https://invoice.yannklein.dev/api/auth/callback/google` is listed in the OAuth client's redirect URIs.
