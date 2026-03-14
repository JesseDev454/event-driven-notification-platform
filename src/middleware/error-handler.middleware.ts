import { ErrorRequestHandler } from 'express';
import { QueryFailedError, TypeORMError } from 'typeorm';
import { ZodError } from 'zod';

import { AppError } from '../types/app-error';
import { errorResponse } from '../utils/response.util';

const isBodyParserSyntaxError = (error: unknown): boolean => {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  return 'body' in error;
};

export const errorHandlerMiddleware: ErrorRequestHandler = (
  error,
  req,
  res,
  next
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isBodyParserSyntaxError(error)) {
    res.status(400).json(errorResponse('Malformed JSON request body', 'invalid_json'));
    return;
  }

  if (error instanceof ZodError) {
    res.status(422).json(errorResponse('Request validation failed', 'validation_error'));
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json(errorResponse(error.message, error.code));
    return;
  }

  if (error instanceof QueryFailedError || error instanceof TypeORMError) {
    console.error(`[${req.requestId}] Database error`, error);
    res.status(500).json(errorResponse('Database operation failed', 'database_error'));
    return;
  }

  console.error(`[${req.requestId}] Unexpected error`, error);
  res.status(500).json(errorResponse('An unexpected error occurred', 'internal_error'));
};
