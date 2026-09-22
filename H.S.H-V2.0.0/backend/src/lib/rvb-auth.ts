import crypto from "crypto";
import jwt from "jsonwebtoken";

export function getAccessSecret(): string {
  const s = process.env.RVB_JWT_ACCESS_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "test" || process.env.RVB_TEST_MODE === "true") return "test-access-secret-please-change-in-production-32chars";
    throw new Error("RVB_JWT_ACCESS_SECRET is required");
  }
  return s;
}

export function getRefreshSecret(): string {
  const s = process.env.RVB_JWT_REFRESH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "test" || process.env.RVB_TEST_MODE === "true") return "test-refresh-secret-please-change-in-production-32chars";
    throw new Error("RVB_JWT_REFRESH_SECRET is required");
  }
  return s;
}

export function getAccessTTL(): string {
  return process.env.RVB_ACCESS_TOKEN_TTL || "15m";
}

export function getRefreshTTL(): string {
  return process.env.RVB_REFRESH_TOKEN_TTL || "30d";
}

export function signAccessToken(payload: { accountId: string; tag: string; role: string; sessionId: string }): string {
  return jwt.sign(payload, getAccessSecret(), { expiresIn: getAccessTTL() as any });
}

export function signRefreshToken(payload: { accountId: string; sessionId: string; familyId: string }): string {
  return jwt.sign(payload, getRefreshSecret(), { expiresIn: getRefreshTTL() as any });
}

export function verifyAccessToken(token: string): any {
  return jwt.verify(token, getAccessSecret());
}

export function verifyRefreshToken(token: string): any {
  return jwt.verify(token, getRefreshSecret());
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function parseExpiryToMs(ttl: string): number {
  // Supports 15m, 30d, 1h etc. Use ms conversion for session expiry
  const m = ttl.match(/^(\d+)([smhd])$/);
  if (!m) return 30 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60*1000, h: 3600*1000, d: 24*3600*1000 };
  return n * (multipliers[unit] || 0);
}

export function toSafeRvbAccount(doc: any): any {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  const { _id, __v, passwordHash, ...rest } = obj;
  // Also remove refresh hashes if somehow present
  const { refreshTokenHash, ...safe } = rest;
  // Ensure passwordHash not leaked
  if ((safe as any).passwordHash) delete (safe as any).passwordHash;
  return safe;
}
