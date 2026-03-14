import { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '../types/app-error';
import {
  PRODUCER_API_KEY_HEADER,
  PRODUCER_REFERENCE_HEADER
} from './auth.constants';

export interface ProducerAuthConfig {
  apiKey: string;
  defaultProducerReference: string;
}

export const createProducerAuthMiddleware =
  ({ apiKey, defaultProducerReference }: ProducerAuthConfig) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const suppliedApiKey = req.header(PRODUCER_API_KEY_HEADER)?.trim();

    if (!suppliedApiKey || suppliedApiKey !== apiKey) {
      next(
        new UnauthorizedError(
          'Producer authentication required',
          'producer_auth_required'
        )
      );
      return;
    }

    req.producerReference =
      req.header(PRODUCER_REFERENCE_HEADER)?.trim() || defaultProducerReference;

    next();
  };
