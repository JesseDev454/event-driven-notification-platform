export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = 'validation_error') {
    super(message, 422, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code = 'not_found') {
    super(message, 404, code);
  }
}
