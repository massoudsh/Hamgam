import type { NextFunction, Request, Response } from "express";

/**
 * Origin allowlist for browser clients. The dashboard is served from a different
 * origin than the API when both run as separate containers, so preflight requests
 * and responses need explicit CORS headers. Values come as a comma-separated list
 * (see CORS_ORIGIN); "*" allows any origin.
 */
export function createCorsMiddleware(allowedOrigins: string) {
  const allowList = allowedOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const allowAll = allowList.includes("*");

  return function cors(req: Request, res: Response, next: NextFunction): void {
    const origin = req.headers.origin;
    if (origin && (allowAll || allowList.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}
