import { describe, expect, it } from 'vitest';
import { isLegacyInvoiceName } from '@/lib/setup';

describe('isLegacyInvoiceName', () => {
  it('matches the historical naming only', () => {
    expect(isLegacyInvoiceName('Invoice GALILEO GLOBAL - Sep 2026 - 202609005')).toBe(true);
    expect(isLegacyInvoiceName('Invoice Looking Glass  - Week #27-28')).toBe(true);
    expect(isLegacyInvoiceName('Invoices summary')).toBe(false);
    expect(isLegacyInvoiceName('Old Invoice X')).toBe(false);
  });
});
