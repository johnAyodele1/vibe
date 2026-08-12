import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOrCreateDeviceId, clearDeviceId } from '../lib/pwa/deviceId';

describe('Push Subscription Lifecycle — Complete', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('getOrCreateDeviceId()', () => {
    it('creates new deviceId on first call', () => {
      const id = getOrCreateDeviceId();
      expect(id).toBeTruthy();
      expect(id.startsWith('dev_')).toBe(true);
    });

    it('returns same deviceId on subsequent calls (persists in localStorage)', () => {
      const id1 = getOrCreateDeviceId();
      const id2 = getOrCreateDeviceId();
      expect(id1).toBe(id2);
    });

    it('clearDeviceId() removes from localStorage', () => {
      getOrCreateDeviceId();
      clearDeviceId();
      expect(localStorage.getItem('zippo_device_id')).toBeNull();
    });
  });
});
