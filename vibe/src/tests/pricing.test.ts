import { describe, it, expect } from 'vitest';
import { formatAmount, formatCredits, formatDiamonds, formatNaira, formatDiamondsWithNaira } from '../lib/pricing';

describe('Pricing and Amount Formatters', () => {
  describe('formatAmount', () => {
    it('formats 3731.7999999999556 to 3,731.80', () => {
      expect(formatAmount(3731.7999999999556)).toBe('3,731.80');
    });

    it('formats 3731.7 to 3,731.70', () => {
      expect(formatAmount(3731.7)).toBe('3,731.70');
    });

    it('formats integer 3731 to 3,731 without trailing decimal zeros', () => {
      expect(formatAmount(3731)).toBe('3,731');
    });

    it('formats zero 0 to 0', () => {
      expect(formatAmount(0)).toBe('0');
    });

    it('formats 0.1 to 0.10', () => {
      expect(formatAmount(0.1)).toBe('0.10');
    });

    it('handles numeric string inputs correctly', () => {
      expect(formatAmount('3731.7999999999556')).toBe('3,731.80');
      expect(formatAmount('3731.7')).toBe('3,731.70');
      expect(formatAmount('3731')).toBe('3,731');
      expect(formatAmount('0')).toBe('0');
      expect(formatAmount('0.1')).toBe('0.10');
    });

    it('handles null, undefined, NaN, and invalid inputs safely', () => {
      expect(formatAmount(null)).toBe('0');
      expect(formatAmount(undefined)).toBe('0');
      expect(formatAmount(NaN)).toBe('0');
      expect(formatAmount('')).toBe('0');
      expect(formatAmount('invalid')).toBe('0');
    });

    it('aliases formatCredits and formatDiamonds correctly', () => {
      expect(formatCredits(3731.7999999999556)).toBe('3,731.80');
      expect(formatDiamonds(3731.7999999999556)).toBe('3,731.80');
    });
  });

  describe('formatNaira', () => {
    it('formats integer amounts with en-NG commas', () => {
      expect(formatNaira(3731)).toBe('₦3,731');
      expect(formatNaira(0)).toBe('₦0');
    });

    it('formats decimal amounts to 2 decimal places with en-NG locale', () => {
      expect(formatNaira(3731.7999999999556)).toBe('₦3,731.80');
      expect(formatNaira(3731.7)).toBe('₦3,731.70');
      expect(formatNaira(0.1)).toBe('₦0.10');
    });

    it('handles numeric strings and null/undefined values safely', () => {
      expect(formatNaira('3731.7999999999556')).toBe('₦3,731.80');
      expect(formatNaira(null)).toBe('₦0');
      expect(formatNaira(undefined)).toBe('₦0');
      expect(formatNaira('invalid')).toBe('₦0');
    });
  });

  describe('formatDiamondsWithNaira', () => {
    it('combines diamond amount and naira estimate correctly', () => {
      expect(formatDiamondsWithNaira(3731.7999999999556, 100)).toBe('💎 3,731.80 (₦373,180)');
    });
  });
});
