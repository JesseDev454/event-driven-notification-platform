declare global {
  namespace Express {
    interface Request {
      requestId: string;
      correlationId?: string | null;
      producerReference?: string | null;
    }
  }
}

export {};
