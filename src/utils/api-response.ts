import type { Response } from "express";
import { ApiError } from "./api-error";
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
): void {
  res.status(statusCode).json({ data, meta: null, error: null });
}
export function sendPaginated<T>(
  res: Response,
  data: T,
  meta: PaginationMeta,
  statusCode = 200,
): void {
  res.status(statusCode).json({ data, meta, error: null });
}
export function sendError(res: Response, error: ApiError): void {
  res.status(error.statusCode).json({
    data: null,
    meta: null,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
    },
  });
}
