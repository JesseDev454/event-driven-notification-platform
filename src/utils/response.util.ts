export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    requestId: string;
    pagination?: {
      limit: number;
      nextCursor: string | null;
      sort?: string;
    };
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
  };
}

export const successResponse = <T>(
  data: T,
  meta?: SuccessResponse<T>['meta']
): SuccessResponse<T> => (meta ? { success: true, data, meta } : { success: true, data });

export const errorResponse = (message: string, code: string): ErrorResponse => ({
  success: false,
  error: {
    message,
    code
  }
});
