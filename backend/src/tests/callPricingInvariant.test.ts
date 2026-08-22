import AdultUser from '../models/AdultUser';

describe('provider call pricing invariant', () => {
  it('uses pricePerMinute as the canonical rate for audio and video', () => {
    const provider = new AdultUser({
      email: 'pricing-test@example.com',
      passwordHash: 'test-password',
      role: 'provider',
      username: 'pricing-test-provider',
      displayName: 'Pricing Test Provider',
      dateOfBirth: new Date('1990-01-01'),
      country: 'NG',
      providerProfile: {
        pricePerMinute: 42,
        audioCallPrice: 0,
        videoCallPrice: 0,
      },
    });

    expect(provider.providerProfile?.audioCallPrice).toBe(42);
    expect(provider.providerProfile?.videoCallPrice).toBe(42);
    expect(provider.providerProfile?.pricePerMinute).toBe(42);
  });

  it('does not invent a fallback call rate when pricePerMinute is not configured', () => {
    const provider = new AdultUser({
      email: 'pricing-zero-test@example.com',
      passwordHash: 'test-password',
      role: 'provider',
      username: 'pricing-zero-provider',
      displayName: 'Pricing Zero Provider',
      dateOfBirth: new Date('1990-01-01'),
      country: 'NG',
      providerProfile: {
        pricePerMinute: 0,
        audioCallPrice: 0,
        videoCallPrice: 0,
      },
    });

    expect(provider.providerProfile?.audioCallPrice).toBe(0);
    expect(provider.providerProfile?.videoCallPrice).toBe(0);
    expect(provider.providerProfile?.pricePerMinute).toBe(0);
  });
});
