import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { RvbAccountModel } from "../models/rvb-account.model";
import { RvbSessionModel } from "../models/rvb-session.model";
import { normalizeTag } from "../constants/rvb-account";
import { verifyPassword, hashPassword, validatePasswordPolicy } from "../lib/password";
import {
  signAccessToken,
  signRefreshToken,
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

function setRefreshCookie(res: any, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  const maxAge = parseExpiryToMs(getRefreshTTL());
  res.cookie("rvb_refresh_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd ? true : false,
    maxAge,
    path: "/",
  });
  // Also set access token cookie for convenience (optional)
  // We keep access token in body for JS memory, but also set short-lived cookie if needed
}

function clearRefreshCookie(res: any) {
  res.clearCookie("rvb_refresh_token", { path: "/" });
  res.clearCookie("rvb_access_token", { path: "/" });
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
    if (!password) {
      res.status(400).json({ success: false, code: "RVB_PASSWORD_REQUIRED" });
      return;
    }
    const account: any = await RvbAccountModel.findOne({ tag: normalizedTag });
    if (!account) {
      res.status(401).json({ success: false, code: "RVB_AUTH_INVALID_CREDENTIALS", message: "Invalid credentials" });
      return;
    }

    // Check lockout
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

    if (account.status === "archived") {
      res.status(403).json({ success: false, code: "RVB_ACCOUNT_ARCHIVED" });
      return;
    }
    if (account.status === "disabled") {
      res.status(403).json({ success: false, code: "RVB_ACCOUNT_DISABLED" });
      return;
    }
    if (!account.passwordHash) {
      res.status(401).json({ success: false, code: "RVB_PASSWORD_NOT_SET", message: "Password not set" });
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

    res.json({
      success: true,
      accessToken,
      refreshToken, // also return for mobile secure storage
      account: toSafeRvbAccount(account),
      mustChangePassword: !!account.mustChangePassword,
    });
  } catch (e: any) {
    console.error("login failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/auth/refresh
router.post("/refresh", async (req, res) => {
  try {
    let rawToken: string | null = null;
    if ((req as any).cookies && (req as any).cookies["rvb_refresh_token"]) rawToken = (req as any).cookies["rvb_refresh_token"];
    else if (req.body && req.body.refreshToken) rawToken = String(req.body.refreshToken);
    else if (req.headers["x-refresh-token"]) rawToken = String(req.headers["x-refresh-token"]);

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

    res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      account: toSafeRvbAccount(account),
    });
  } catch (e) {
    console.error("refresh failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/auth/logout
router.post("/logout", async (req, res) => {
  try {
    let rawToken: string | null = null;
    if ((req as any).cookies && (req as any).cookies["rvb_refresh_token"]) rawToken = (req as any).cookies["rvb_refresh_token"];
    else if (req.body && req.body.refreshToken) rawToken = String(req.body.refreshToken);
    else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      // logout via access token? revoke all? For now revoke by refresh if present, else try to find session by access payload
      try {
        const access = req.headers.authorization.slice(7);
        const payload: any = await import("../lib/rvb-auth").then((m) => { try { return m.verifyAccessToken(access); } catch { return null; } });
        if (payload && payload.sessionId) {
          const sess: any = await RvbSessionModel.findOne({ id: payload.sessionId });
          if (sess && !sess.revokedAt) {
            sess.revokedAt = Date.now();
            await sess.save();
          }
        }
      } catch {}
    }

    if (rawToken) {
      const hash = hashRefreshToken(rawToken);
      const sess: any = await RvbSessionModel.findOne({ refreshTokenHash: hash });
      if (sess && !sess.revokedAt) {
        sess.revokedAt = Date.now();
        await sess.save();
      }
    } else {
      // If no token supplied, try to revoke current session from access token
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const payload: any = verifyRefreshToken(rawToken || "") as any;
        } catch {}
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
        res.json({ success: true, accessToken: newAccessToken, refreshToken: newRefreshToken, account: toSafeRvbAccount(account) });
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
