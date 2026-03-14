import { randomUUID } from 'node:crypto';

import { NextFunction, Request, Response } from 'express';

import { CORRELATION_ID_HEADER } from './auth.constants';

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.header('x-request-id')?.trim() || randomUUID();
  const correlationId = req.header(CORRELATION_ID_HEADER)?.trim() || null;

  req.requestId = requestId;
  req.correlationId = correlationId;
  res.setHeader('X-Request-Id', requestId);
  if (correlationId) {
    res.setHeader('X-Correlation-Id', correlationId);
  }

  next();
};
