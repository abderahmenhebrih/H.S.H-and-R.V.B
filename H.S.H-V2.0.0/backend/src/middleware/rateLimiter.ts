import type { Request, Response, NextFunction } from "express";

const rateBuckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(opts: { windowMs: number; max: number; key: (req: any) => string; code?: string }) {
  return (req: any, res: any, next: any) => {
    const k = opts.key(req);
    const now = Date.now();
    const b = rateBuckets.get(k);
    if (!b || now > b.reset) {
      rateBuckets.set(k, { count: 1, reset: now + opts.windowMs });
      return next();
    }
    if (b.count >= opts.max) {
      res.status(429).json({ success: false, code: opts.code || "RATE_LIMITED", message: "Too many requests" });
      return;
    }
    b.count++;
    next();
  };
}

export const ipKey = (req: any) => req.ip || req.headers["x-forwarded-for"] || "unknown";
export const accountKey = (req: any) => (req as any).rvbUser?.accountId || ipKey(req);
