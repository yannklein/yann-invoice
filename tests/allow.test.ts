import { describe, expect, it } from 'vitest';
import { isAllowedEmail } from '@/lib/auth/allow';

describe('isAllowedEmail', () => {
  it('matches the allowlisted address case-insensitively', () => {
    expect(isAllowedEmail('Yann.Luc.Klein@gmail.com', 'yann.luc.klein@gmail.com')).toBe(true);
  });
  it('rejects others, empty values and a missing env var', () => {
    expect(isAllowedEmail('someone@gmail.com', 'yann.luc.klein@gmail.com')).toBe(false);
    expect(isAllowedEmail(undefined, 'yann.luc.klein@gmail.com')).toBe(false);
    expect(isAllowedEmail('yann.luc.klein@gmail.com', undefined)).toBe(false);
    expect(isAllowedEmail('', '')).toBe(false);
  });
});
