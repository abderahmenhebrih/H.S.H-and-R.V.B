import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { RvbAccountModel } from "../models/rvb-account.model";
import { RvbSessionModel } from "../models/rvb-session.model";
import { normalizeTag, isValidTag } from "../constants/rvb-account";
import { verifyPassword, hashPassword, validatePasswordPolicy } from "../lib/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashRefreshToken,
  parseExpiryToMs,
  getRefreshTTL,
  toSafeRvbAccount,
} from "../lib/rvb-auth";
import { requireRvbAuth, type RvbAuthRequest } from "../middleware/rvb-auth";

const router = Router();

function codeError(code: string, status: number) {
  const err = new Error(code) as any;
  err.code = code;
  err.status = status;
  return err;
}

const RVB_REFRESH_COOKIE_NAME = "rvb_refresh_token";

function getRefreshCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: isProd,
    path: "/",
    maxAge: parseExpiryToMs(getRefreshTTL()),
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

function getClearRefreshCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: isProd,
    path: "/",
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

function setRefreshCookie(res: any, token: string) {
  res.cookie(RVB_REFRESH_COOKIE_NAME, token, getRefreshCookieOptions());
}

function clearRefreshCookie(res: any) {
  const opts = getClearRefreshCookieOptions();
  res.clearCookie(RVB_REFRESH_COOKIE_NAME, opts);
  // Clear legacy access cookie if ever set, using same clearing semantics
  res.clearCookie("rvb_access_token", opts);
}

function isNativeLoginRequest(req: any): boolean {
  const h = req.headers["x-rvb-client"] || req.headers["x-client-type"];
  if (typeof h === "string" && h.toLowerCase() === "native") return true;
  if (req.body && (req.body.native === true || req.body.isNative === true)) return true;
  return false;
}

// POST /api/rvb/auth/login
router.post("/login", async (req, res) => {
  try {
    const { tag, password } = req.body as any;
    const normalizedTag = normalizeTag(String(tag || ""));
    if (!normalizedTag) {
      res.status(400).json({ success: false, code: "RVB_TAG_REQUIRED" });
      return;
    }
    // Validate tag format before DB work: avoid bcrypt/DB for malformed tags
    if (!isValidTag(normalizedTag)) {
      res.status(401).json({ success: false, code: "RVB_AUTH_INVALID_CREDENTIALS", message: "Invalid credentials" });
      return;
    }
    if (!password) {
      res.status(400).json({ success: false, code: "RVB_PASSWORD_REQUIRED" });
      return;
    }
    const account: any = await RvbAccountModel.findOne({ tag: normalizedTag });
    if (!account) {
      res.status(401).json({ success: false, code: "RVB_AUTH_INVALID_CREDENTIALS", message: "Invalid credentials" });
      return;
    }

    // Check lockout (preserve 5 attempts / 15m)
    const now = Date.now();
    if (account.lockedUntil && account.lockedUntil > now) {
      res.status(423).json({ success: false, code: "RVB_AUTH_TEMPORARILY_LOCKED", message: "Account temporarily locked" });
      return;
    }
    // Auto-unlock if time passed
    if (account.lockedUntil && account.lockedUntil <= now) {
      account.failedLoginAttempts = 0;
      account.lockedUntil = null;
    }

    // For unauthenticated login, do not reveal archived/disabled/password-not-set state; return generic invalid credentials
    if (account.status === "archived" || account.status === "disabled" || !account.passwordHash) {
      res.status(401).json({ success: false, code: "RVB_AUTH_INVALID_CREDENTIALS", message: "Invalid credentials" });
      return;
    }

    const ok = await verifyPassword(String(password), account.passwordHash);
    if (!ok) {
      account.failedLoginAttempts = (account.failedLoginAttempts || 0) + 1;
      if (account.failedLoginAttempts >= 5) {
        account.lockedUntil = now + 15 * 60 * 1000;
      }
      account.updatedAt = now;
      await account.save();
      // If just locked, return lock code
      if (account.lockedUntil && account.lockedUntil > now) {
        res.status(423).json({ success: false, code: "RVB_AUTH_TEMPORARILY_LOCKED" });
        return;
      }
      res.status(401).json({ success: false, code: "RVB_AUTH_INVALID_CREDENTIALS", message: "Invalid credentials" });
      return;
    }

    // Success: reset lockout, update lastLogin
    account.failedLoginAttempts = 0;
    account.lockedUntil = null;
    account.lastLoginAt = now;
    account.updatedAt = now;
    await account.save();

    const sessionId = `sess-${uuidv4()}`;
    const familyId = `fam-${uuidv4()}`;
    const accessToken = signAccessToken({ accountId: account.id, tag: account.tag, role: account.role, sessionId });
    const refreshToken = signRefreshToken({ accountId: account.id, sessionId, familyId });
    const refreshHash = hashRefreshToken(refreshToken);
    const expiresAt = now + parseExpiryToMs(getRefreshTTL());

    await RvbSessionModel.create({
      id: sessionId,
      accountId: account.id,
      refreshTokenHash: refreshHash,
      createdAt: now,
      expiresAt,
      revokedAt: null,
      lastUsedAt: now,
      userAgent: req.headers["user-agent"] as string | undefined,
      ipAddress: (req.ip || (req.headers["x-forwarded-for"] as string) || undefined) as string | undefined,
      rotationFamilyId: familyId,
    });

    setRefreshCookie(res, refreshToken);

    // Web: HttpOnly cookie only. Native: explicit X-RVB-Client header required to receive JSON refreshToken.
    // This prevents JS-readable exposure for web while preserving documented native flow.
    const isNative = isNativeLoginRequest(req);
    if (isNative) {
      res.json({
        success: true,
        accessToken,
        refreshToken,
        account: toSafeRvbAccount(account),
        mustChangePassword: !!account.mustChangePassword,
      });
    } else {
      res.json({
        success: true,
        accessToken,
        account: toSafeRvbAccount(account),
        mustChangePassword: !!account.mustChangePassword,
      });
    }
  } catch (e: any) {
    console.error("login failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/auth/refresh
// Web: cookie-only, never returns JSON refreshToken.
// Native: must supply refreshToken explicitly in body or X-Refresh-Token header; returns JSON refreshToken.
// A header flag alone (e.g. X-RVB-Client) without explicit token is NOT sufficient — prevents cookie+forged-flag leak.
router.post("/refresh", async (req, res) => {
  try {
    const cookieToken = (req as any).cookies && (req as any).cookies[RVB_REFRESH_COOKIE_NAME] ? String((req as any).cookies[RVB_REFRESH_COOKIE_NAME]) : null;
    const bodyToken = req.body && req.body.refreshToken ? String(req.body.refreshToken) : null;
    const headerToken = req.headers["x-refresh-token"] ? String(req.headers["x-refresh-token"] as string) : null;
    const explicitToken = bodyToken || headerToken;
    const isNativeRefresh = !!explicitToken;

    let rawToken: string | null = null;
    if (explicitToken) rawToken = explicitToken;
    else if (cookieToken) rawToken = cookieToken;

    if (!rawToken) {
      res.status(401).json({ success: false, code: "RVB_REFRESH_REQUIRED" });
      return;
    }

    let payload: any;
    try {
      payload = verifyRefreshToken(rawToken);
    } catch {
      res.status(401).json({ success: false, code: "RVB_TOKEN_INVALID" });
      return;
    }

    const hash = hashRefreshToken(rawToken);
    const now = Date.now();
    // Atomic: claim the refresh token only if not revoked and not expired
    const session: any = await RvbSessionModel.findOneAndUpdate(
      { refreshTokenHash: hash, revokedAt: null, expiresAt: { $gt: now } },
      { $set: { revokedAt: now, lastUsedAt: now } },
      { returnDocument: "after" } as any,
    );
    if (!session) {
      // Determine reason: check if exists but revoked/expired
      const existing: any = await RvbSessionModel.findOne({ refreshTokenHash: hash }).lean();
      if (existing) {
        if (existing.revokedAt) {
          res.status(401).json({ success: false, code: "RVB_TOKEN_INVALID" });
          return;
        }
        if (existing.expiresAt < now) {
          res.status(401).json({ success: false, code: "RVB_TOKEN_EXPIRED" });
          return;
        }
      }
      res.status(401).json({ success: false, code: "RVB_TOKEN_INVALID" });
      return;
    }

    const account: any = await RvbAccountModel.findOne({ id: payload.accountId }).lean();
    if (!account || account.status !== "active") {
      res.status(401).json({ success: false, code: "RVB_TOKEN_INVALID" });
      return;
    }

    // Rotate: create new session (old already revoked atomically)
    const newSessionId = `sess-${uuidv4()}`;
    const familyId = session.rotationFamilyId || payload.familyId || `fam-${uuidv4()}`;
    const newAccessToken = signAccessToken({ accountId: account.id, tag: account.tag, role: account.role, sessionId: newSessionId });
    const newRefreshToken = signRefreshToken({ accountId: account.id, sessionId: newSessionId, familyId });
    const newHash = hashRefreshToken(newRefreshToken);
    const expiresAt = now + parseExpiryToMs(getRefreshTTL());

    await RvbSessionModel.create({
      id: newSessionId,
      accountId: account.id,
      refreshTokenHash: newHash,
      createdAt: now,
      expiresAt,
      revokedAt: null,
      lastUsedAt: now,
      userAgent: req.headers["user-agent"] as string | undefined,
      ipAddress: (req.ip || (req.headers["x-forwarded-for"] as string) || undefined) as string | undefined,
      rotationFamilyId: familyId,
    });

    setRefreshCookie(res, newRefreshToken);

    if (isNativeRefresh) {
      res.json({
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        account: toSafeRvbAccount(account),
      });
    } else {
      res.json({
        success: true,
        accessToken: newAccessToken,
        account: toSafeRvbAccount(account),
      });
    }
  } catch (e) {
    console.error("refresh failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/auth/logout
router.post("/logout", async (req, res) => {
  try {
    let refreshToken: string | null = null;
    if ((req as any).cookies && (req as any).cookies[RVB_REFRESH_COOKIE_NAME]) refreshToken = (req as any).cookies[RVB_REFRESH_COOKIE_NAME];
    else if (req.body && req.body.refreshToken) refreshToken = String(req.body.refreshToken);
    else if (req.headers["x-refresh-token"]) refreshToken = String(req.headers["x-refresh-token"] as string);

    if (refreshToken) {
      // Valid refresh cookie exists: revoke the correct refresh session by hash (no token verification needed for revocation)
      const hash = hashRefreshToken(refreshToken);
      const sess: any = await RvbSessionModel.findOne({ refreshTokenHash: hash });
      if (sess && !sess.revokedAt) {
        sess.revokedAt = Date.now();
        await sess.save();
      }
    } else {
      // Fallback: verify access token with access-token verifier and revoke its session
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const access = authHeader.slice(7).trim();
        try {
          const payload: any = verifyAccessToken(access);
          if (payload && payload.sessionId) {
            const sess: any = await RvbSessionModel.findOne({ id: payload.sessionId });
            if (sess && !sess.revokedAt) {
              sess.revokedAt = Date.now();
              await sess.save();
            }
          }
        } catch {
          // Invalid/expired access token: still clear cookie and succeed
        }
      }
    }

    clearRefreshCookie(res);
    res.json({ success: true });
  } catch (e) {
    console.error("logout failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/auth/me
router.get("/me", requireRvbAuth as any, async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const account: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    if (!account) {
      res.status(404).json({ success: false, code: "RVB_ACCOUNT_NOT_FOUND" });
      return;
    }
    res.json({ success: true, account: toSafeRvbAccount(account) });
  } catch (e) {
    console.error("me failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/auth/change-password
router.post("/change-password", requireRvbAuth as any, async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { currentPassword, newPassword, confirmPassword } = req.body as any;
    if (!currentPassword) {
      res.status(400).json({ success: false, code: "RVB_PASSWORD_REQUIRED" });
      return;
    }
    const policyError = validatePasswordPolicy(newPassword, confirmPassword);
    if (policyError) {
      res.status(400).json({ success: false, code: policyError });
      return;
    }
    const account: any = await RvbAccountModel.findOne({ id: user.accountId });
    if (!account || !account.passwordHash) {
      res.status(400).json({ success: false, code: "RVB_PASSWORD_NOT_SET" });
      return;
    }
    const ok = await verifyPassword(String(currentPassword), account.passwordHash);
    if (!ok) {
      res.status(401).json({ success: false, code: "RVB_AUTH_INVALID_CREDENTIALS" });
      return;
    }
    account.passwordHash = await hashPassword(String(newPassword));
    account.mustChangePassword = false;
    account.passwordChangedAt = Date.now();
    account.updatedAt = Date.now();
    await account.save();

    // Revoke all other sessions except current
    const currentSessionId = user.sessionId;
    await RvbSessionModel.updateMany(
      { accountId: account.id, revokedAt: null, id: { $ne: currentSessionId } } as any,
      { $set: { revokedAt: Date.now() } } as any,
    );

    // Rotate current session's refresh token
    if (currentSessionId) {
      const sess: any = await RvbSessionModel.findOne({ id: currentSessionId });
      if (sess && !sess.revokedAt) {
        sess.revokedAt = Date.now();
        await sess.save();
        const now = Date.now();
        const newSessionId = `sess-${uuidv4()}`;
        const familyId = sess.rotationFamilyId || `fam-${uuidv4()}`;
        const newAccessToken = signAccessToken({ accountId: account.id, tag: account.tag, role: account.role, sessionId: newSessionId });
        const newRefreshToken = signRefreshToken({ accountId: account.id, sessionId: newSessionId, familyId });
        const newHash = hashRefreshToken(newRefreshToken);
        const expiresAt = now + parseExpiryToMs(getRefreshTTL());
        await RvbSessionModel.create({
          id: newSessionId,
          accountId: account.id,
          refreshTokenHash: newHash,
          createdAt: now,
          expiresAt,
          revokedAt: null,
          lastUsedAt: now,
          userAgent: req.headers["user-agent"] as string | undefined,
          ipAddress: (req.ip || undefined) as string | undefined,
          rotationFamilyId: familyId,
        });
        setRefreshCookie(res, newRefreshToken);
        // Web: HttpOnly cookie only — never return refreshToken in JSON (even for native, use explicit refresh flow).
        res.json({ success: true, accessToken: newAccessToken, account: toSafeRvbAccount(account) });
        return;
      }
    }

    res.json({ success: true, account: toSafeRvbAccount(account) });
  } catch (e) {
    console.error("change-password failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

export default router;
