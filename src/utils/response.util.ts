export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
  };
}

export const successResponse = <T>(data: T): SuccessResponse<T> => ({
  success: true,
  data
});

export const errorResponse = (message: string, code: string): ErrorResponse => ({
  success: false,
  error: {
    message,
    code
  }
});
