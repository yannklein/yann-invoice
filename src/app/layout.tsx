import type { Metadata } from 'next';
import Link from 'next/link';
import { auth, signOut } from '@/auth';
import './globals.css';

export const metadata: Metadata = { title: "Yann's finance", description: 'Yann Klein — invoices, shared account and investments' };

const navLink = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/50 transition-colors hover:text-foreground';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen text-foreground antialiased">
        <header className="border-b border-foreground/10">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
            <Link href="/dashboard" className="mr-2 text-xl font-black tracking-tight">yann·finance</Link>
            <Link href="/dashboard" className={navLink}>Dashboard</Link>
            <Link href="/invoices" className={navLink}>Invoices</Link>
            <Link href="/invoices/new" className={navLink}>New invoice</Link>
            <Link href="/shared" className={navLink}>Shared account</Link>
            <Link href="/invest" className={navLink}>Invest</Link>
            <Link href="/snapshot" className={navLink}>Snapshot</Link>
            <Link href="/settings" className={navLink}>Settings</Link>
            {session?.user && (
              <form
                className="ml-auto"
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/' });
                }}
              >
                <button className={navLink}>Sign out · {session.user.email}</button>
              </form>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
        <footer className="pb-10 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/25">
          yannklein.dev · finance
        </footer>
      </body>
    </html>
  );
}
