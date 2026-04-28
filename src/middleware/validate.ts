import type { Request, Response, NextFunction } from "express";
import { z } from "zod/v4";
import { ApiError } from "../utils/api-error";
export function validate(schema: z.ZodType<unknown>, source: "body" | "query" | "params" = "body",) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = (schema as z.ZodObject<any>).safeParse(req[source]);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join(".") || "_root";
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      throw ApiError.unprocessable("Validation failed", fieldErrors);
    } (req as any)[source] = result.data;
    next();
  };
}
