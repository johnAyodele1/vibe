import { validateProviderPricing } from '../middleware/providerPricingValidation';

const makeResponse = () => {
  const response: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return response;
};

describe('provider pricing validation', () => {
  const invalidRates = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, ''];

  it.each(invalidRates)('rejects invalid per-minute rate %p on onboarding step 4', (rate) => {
    const req: any = { params: { stepNumber: '4' }, body: { perMinuteRate: rate } };
    const res = makeResponse();
    const next = jest.fn();

    validateProviderPricing(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      errors: { perMinuteRate: 'Minimum rate: per-minute rate must be greater than 0 diamonds' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each(invalidRates)('rejects invalid tonight rate %p on pricing update', (rate) => {
    const req: any = { params: {}, body: { tonightRate: rate } };
    const res = makeResponse();
    const next = jest.fn();

    validateProviderPricing(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Minimum rate: rate for tonight must be greater than 0 diamonds' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a positive fractional rate below 0.01', () => {
    const req: any = { params: {}, body: { perMinuteRate: 0.001, tonightRate: 0.009 } };
    const res = makeResponse();
    const next = jest.fn();

    validateProviderPricing(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ perMinuteRate: 0.001, tonightRate: 0.009 });
    expect(res.status).not.toHaveBeenCalled();
  });
});
