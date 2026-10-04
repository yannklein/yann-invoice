export function isAllowedEmail(email: string | null | undefined, allowed: string | undefined): boolean {
  if (!email || !allowed) return false;
  return email.trim().toLowerCase() === allowed.trim().toLowerCase();
}
