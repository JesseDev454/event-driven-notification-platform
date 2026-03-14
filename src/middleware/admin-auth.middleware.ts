import { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '../types/app-error';
import { ADMIN_API_KEY_HEADER } from './auth.constants';

export interface AdminAuthConfig {
  apiKey: string;
}

export const createAdminAuthMiddleware =
  ({ apiKey }: AdminAuthConfig) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const suppliedApiKey = req.header(ADMIN_API_KEY_HEADER)?.trim();

    if (!suppliedApiKey || suppliedApiKey !== apiKey) {
      next(
        new UnauthorizedError(
          'Admin authentication required',
          'admin_auth_required'
        )
      );
      return;
    }

    next();
  };
