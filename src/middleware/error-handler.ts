import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error";
import { sendError } from "../utils/api-response";
import { env } from "../config/env";
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction,): void {
  if (err instanceof ApiError) {
    sendError(res, err);
    return;
  }
  if (err.name === "ZodError") {
    const zodErr = err as any;
    const fieldErrors: Record<string, string[]> = {};

    for (const issue of zodErr.issues ?? []) {
      const path = (issue.path ?? []).join(".") || "_root";
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }

    sendError(
      res,
      ApiError.unprocessable("Validation failed", fieldErrors),
    );
    return;
  }
  if (
    err.name === "JsonWebTokenError" ||
    err.name === "TokenExpiredError" ||
    err.name === "NotBeforeError"
  ) {
    sendError(res, ApiError.unauthorized("Invalid or expired token"));
    return;
  }
  if ((err as any).code === "P2002") {
    const target = (err as any).meta?.target;
    const field = Array.isArray(target) ? target[0] : "field";
    sendError(
      res,
      ApiError.conflict(`A record with that ${field} already exists`),
    );
    return;
  }
  console.error("Unhandled error:", err);
  const message =
    env.NODE_ENV === "production"
      ? "Something went wrong"
      : err.message || "Unknown error";

  sendError(res, ApiError.internal(message));
}
