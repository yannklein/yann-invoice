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

## Deploy (Coolify)

1. Push this repo to GitHub (private).
2. Coolify → New resource → this repo → Build pack **Dockerfile**, port 3000, domain `invoice.yannklein.dev`.
3. Environment: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL`, `AUTH_TRUST_HOST=true`, `AUTH_URL=https://invoice.yannklein.dev`.
4. Deploy. Confirm `https://invoice.yannklein.dev/api/auth/callback/google` is listed in the OAuth client's redirect URIs.
