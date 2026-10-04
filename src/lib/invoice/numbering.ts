/** YYYYMM of the issue date + (highest 3-digit counter already used in that month) + 1. */
export function nextNumber(existing: (string | null)[], issueDate: string): string {
  const prefix = issueDate.slice(0, 4) + issueDate.slice(5, 7);
  let max = 0;
  for (const n of existing) {
    const m = n?.match(/^(\d{6})(\d{3})/);
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return prefix + String(max + 1).padStart(3, '0');
}

export function isDuplicate(existing: (string | null)[], candidate: string): boolean {
  const c = candidate.trim().toLowerCase();
  return c !== '' && existing.some((n) => n?.trim().toLowerCase() === c);
}
