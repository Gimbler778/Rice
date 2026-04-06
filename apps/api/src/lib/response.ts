import type { Response } from "express";

export const RESPONSE_CODE = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export type ApiSuccessResponse<T> = {
  success: true;
  code: number;
  message: string;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  code: number;
  message: string;
  error: string;
};

export function sendSuccess<T>(
  res: Response,
  code: number,
  message: string,
  data: T,
) {
  return res.status(code).json({
    success: true,
    code,
    message,
    data,
  } satisfies ApiSuccessResponse<T>);
}

export function sendError(
  res: Response,
  code: number,
  message: string,
  error: string = message,
) {
  return res.status(code).json({
    success: false,
    code,
    message,
    error,
  } satisfies ApiErrorResponse);
}
