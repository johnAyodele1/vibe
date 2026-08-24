import { NextFunction, Request, Response } from 'express';

export const isValidPositiveRate = (value: unknown): boolean => {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return false;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0;
};

export const validateProviderPricing = (req: Request, res: Response, next: NextFunction) => {
  const isOnboardingStep4 = req.params.stepNumber === '4';
  const fields = [
    ['perMinuteRate', 'Per-minute rate'],
    ['tonightRate', 'Rate for tonight'],
  ] as const;

  for (const [field, label] of fields) {
    if (req.body?.[field] === undefined) continue;

    if (!isValidPositiveRate(req.body[field])) {
      const message = `${label} must be greater than 0 diamonds`;

      if (isOnboardingStep4) {
        return res.status(400).json({
          success: false,
          errors: { [field]: message },
        });
      }

      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message },
      });
    }

    req.body[field] = Number(req.body[field]);
  }

  return next();
};
