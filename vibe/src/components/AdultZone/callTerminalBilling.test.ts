import { describe, expect, it } from 'vitest';

const hasAuthoritativeCharge = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isNonBilledTerminalReason = (reason: string): boolean =>
  reason === 'declined' ||
  reason === 'missed' ||
  reason === 'no_answer' ||
  reason === 'cancelled_by_caller' ||
  reason === 'connection_failed';

describe('terminal call billing invariants', () => {
  it('rejects missing billing data for an ended call', () => {
    expect(hasAuthoritativeCharge(undefined)).toBe(false);
    expect(hasAuthoritativeCharge(null)).toBe(false);
    expect(hasAuthoritativeCharge(NaN)).toBe(false);
    expect(hasAuthoritativeCharge(-1)).toBe(false);
  });

  it('accepts a server-provided zero only when it is explicitly present', () => {
    expect(hasAuthoritativeCharge(0)).toBe(true);
    expect(hasAuthoritativeCharge(42)).toBe(true);
  });

  it('allows zero only for explicitly non-billed terminal reasons', () => {
    expect(isNonBilledTerminalReason('declined')).toBe(true);
    expect(isNonBilledTerminalReason('missed')).toBe(true);
    expect(isNonBilledTerminalReason('cancelled_by_caller')).toBe(true);
    expect(isNonBilledTerminalReason('connection_failed')).toBe(true);
    expect(isNonBilledTerminalReason('hung_up')).toBe(false);
  });
});
