import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Adult Zone Error:', err);

  const status = err.status || 500;
  const code = err.code || 'SERVER_ERROR';
  const message = err.message || 'Internal server error';

  res.status(status).json({
    success: false,
    error: {
      code,
      message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : message,
    },
  });
};
