import AdultUser from '../models/AdultUser';

describe('canonical call-rate source', () => {
  const baseProvider = {
    email: 'canonical-call-rate@example.com',
    passwordHash: 'test-password',
    role: 'provider' as const,
    username: 'canonical-call-rate-provider',
    displayName: 'Canonical Call Rate Provider',
    dateOfBirth: new Date('1990-01-01'),
    country: 'NG',
  };

  it('returns pricePerMinute for both audio and video reads', () => {
    const provider = new AdultUser({
      ...baseProvider,
      providerProfile: {
        pricePerMinute: 42,
        audioCallPrice: 2,
        videoCallPrice: 99,
      },
    });

    expect(provider.providerProfile?.audioCallPrice).toBe(42);
    expect(provider.providerProfile?.videoCallPrice).toBe(42);
  });

  it('returns zero instead of falling back to legacy media-specific prices when unconfigured', () => {
    const provider = new AdultUser({
      ...baseProvider,
      providerProfile: {
        pricePerMinute: 0,
        audioCallPrice: 2,
        videoCallPrice: 99,
      },
    });

    expect(provider.providerProfile?.audioCallPrice).toBe(0);
    expect(provider.providerProfile?.videoCallPrice).toBe(0);
  });
});
