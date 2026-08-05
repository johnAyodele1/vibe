import { Request, Response, NextFunction } from 'express';
import { IUser } from './models';

declare global {
  namespace Express {
    interface User extends IUser {}
  }
}

export type IExpressRequest = Request;
export { Response, NextFunction };
