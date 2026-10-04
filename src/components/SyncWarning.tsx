export function SyncWarning({ failed, consequence }: { failed: number; consequence: string }) {
  if (!failed) return null;
  return (
    <p role="alert" className="rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      {failed} invoice sheet{failed === 1 ? '' : 's'} could not be read from Google (probably a rate limit). {consequence} Reload in a minute to retry.
    </p>
  );
}
