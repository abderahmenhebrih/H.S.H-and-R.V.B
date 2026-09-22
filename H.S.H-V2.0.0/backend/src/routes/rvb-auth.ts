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
import { rateLimit, ipKey, accountKey } from "../middleware/rateLimiter";

function safeDisconnectSession(sessionId: string | null | undefined) {
  if (!sessionId) return;
  try {
    const { disconnectRvbSession } = require("../lib/chat-socket");
    if (typeof disconnectRvbSession === "function") disconnectRvbSession(sessionId);
  } catch {}
}
function safeDisconnectAccount(accountId: string | null | undefined) {
  if (!accountId) return;
  try {
    const { disconnectRvbAccount } = require("../lib/chat-socket");
    if (typeof disconnectRvbAccount === "function") disconnectRvbAccount(accountId);
  } catch {}
}
function safeDisconnectAccountExcept(accountId: string | null | undefined, exceptSessionId: string | null | undefined) {
  if (!accountId) return;
  try {
    const mod = require("../lib/chat-socket");
    if (typeof mod.disconnectRvbAccountExcept === "function") mod.disconnectRvbAccountExcept(accountId, exceptSessionId || null);
    else if (typeof mod.disconnectRvbAccount === "function") {
      // fallback: manual filter if helper not available
      const io = mod.getIO ? mod.getIO() : null;
      if (io) {
        for (const sock of (io.sockets.sockets as any).values()) {
          const u = (sock as any).data?.rvbUser;
          if (u?.accountId === accountId && u?.sessionId !== exceptSessionId) {
            try { sock.disconnect(true); } catch {}
          }
        }
      }
    }
  } catch {}
}

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
  const h = req.headers["x-rvb-client"];
  if (typeof h === "string" && h.toLowerCase() === "native") return true;
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

    const isNative = isNativeLoginRequest(req);
    const clientType: "web" | "native" = isNative ? "native" : "web";
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
      clientType,
    } as any);

    setRefreshCookie(res, refreshToken);

    // Web: HttpOnly cookie only. Native: explicit X-RVB-Client: native header required to receive JSON refreshToken.
    // This prevents JS-readable exposure for web while preserving documented native flow.
    // clientType is stored in trusted session metadata.
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

    // Preserve clientType from trusted session metadata (not forged header)
    const preservedClientType: "web" | "native" = (session as any).clientType === "native" ? "native" : "web";
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
      clientType: preservedClientType,
    } as any);

    setRefreshCookie(res, newRefreshToken);

    // Immediately disconnect sockets using the old revoked session (not the new one)
    safeDisconnectSession(session.id || payload.sessionId);

    // Native sessions receive refreshToken in JSON (trusted metadata), web only via HttpOnly cookie
    if (preservedClientType === "native") {
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
    let revokedSessionId: string | null = null;
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
        revokedSessionId = sess.id;
      } else if (sess) {
        revokedSessionId = sess.id;
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
              revokedSessionId = payload.sessionId;
            } else {
              revokedSessionId = payload.sessionId;
            }
          }
        } catch {
          // Invalid/expired access token: still clear cookie and succeed
        }
      }
    }

    if (revokedSessionId) safeDisconnectSession(revokedSessionId);

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

// GET /api/rvb/auth/onboarding - fetch onboarding status (derived from auth, uses account fields)
router.get("/onboarding", requireRvbAuth as any, async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const account: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    if (!account) { res.status(404).json({ success: false, code: "RVB_ACCOUNT_NOT_FOUND" }); return; }
    res.json({ success: true, onboardingStatus: account.onboardingStatus, profilePicture: account.profilePicture || null, account: toSafeRvbAccount(account) });
  } catch (e) {
    console.error("get onboarding failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/auth/onboarding - self onboarding to set profilePicture and complete status (derives account from auth)
router.post("/onboarding", requireRvbAuth as any, async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { profilePicture } = req.body as any;
    const account: any = await RvbAccountModel.findOne({ id: user.accountId });
    if (!account) { res.status(404).json({ success: false, code: "RVB_ACCOUNT_NOT_FOUND" }); return; }
    if (!profilePicture || typeof profilePicture !== "string" || !profilePicture.startsWith("data:image/")) {
      res.status(400).json({ success: false, code: "RVB_PROFILE_PICTURE_REQUIRED" });
      return;
    }
    // Enforce smaller payload (<200k) and ~512x512 max is handled frontend canvas; backend double checks length
    if (profilePicture.length > 250000) {
      res.status(400).json({ success: false, code: "RVB_PROFILE_PICTURE_TOO_LARGE" });
      return;
    }
    if (profilePicture.length > 2000000) {
      res.status(400).json({ success: false, code: "RVB_PROFILE_PICTURE_INVALID" });
      return;
    }
    account.profilePicture = profilePicture;
    account.onboardingStatus = "complete";
    account.updatedAt = Date.now();
    await account.save();
    res.json({ success: true, account: toSafeRvbAccount(account) });
  } catch (e) {
    console.error("onboarding failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/rvb/auth/profile - self-service profile update (displayName, profilePicture)
router.patch("/profile", requireRvbAuth as any, async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { displayName, profilePicture } = req.body as any;
    const account: any = await RvbAccountModel.findOne({ id: user.accountId });
    if (!account) { res.status(404).json({ success: false, code: "RVB_ACCOUNT_NOT_FOUND" }); return; }
    const updates: any = {};
    const unset: any = {};
    if (displayName !== undefined) {
      const name = String(displayName).trim();
      if (!name) { res.status(400).json({ success: false, code: "RVB_DISPLAY_NAME_REQUIRED" }); return; }
      // Allow owner to edit own displayName (personal setting) — restricted length
      if (name.length > 80) { res.status(400).json({ success: false, code: "RVB_DISPLAY_NAME_TOO_LONG" }); return; }
      updates.displayName = name;
    }
    if (profilePicture !== undefined) {
      if (profilePicture === null || profilePicture === "") {
        // After onboarding, replace photo allowed but not leave without photo - require replacement
        if (account.onboardingStatus === "complete") {
          res.status(400).json({ success: false, code: "RVB_PROFILE_PICTURE_REQUIRED" });
          return;
        }
        unset.profilePicture = "";
      } else if (typeof profilePicture === "string" && profilePicture.length < 2000000) {
        if (!profilePicture.startsWith("data:image/") && !profilePicture.startsWith("http")) {
          res.status(400).json({ success: false, code: "RVB_PROFILE_PICTURE_INVALID" });
          return;
        }
        updates.profilePicture = profilePicture;
      } else { res.status(400).json({ success: false, code: "RVB_PROFILE_PICTURE_INVALID" }); return; }
    }
    if (Object.keys(updates).length === 0 && Object.keys(unset).length === 0) { res.json({ success: true, account: toSafeRvbAccount(account) }); return; }
    updates.updatedAt = Date.now();
    const updateOps: any = {};
    if (Object.keys(updates).length) updateOps.$set = updates;
    if (Object.keys(unset).length) updateOps.$unset = unset;
    const updated = await RvbAccountModel.findOneAndUpdate({ id: user.accountId }, updateOps, { new: true, returnDocument: "after" } as any);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (e) {
    console.error("patch profile failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/rvb/auth/preferences - personal preferences: notifications + ui {language, theme}
router.patch("/preferences", requireRvbAuth as any, async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { notifications, ui } = req.body as any;
    const allowedNotifKeys = ["chats", "mentions", "requests", "orders", "statusUpdates", "reminders"];
    const hasNotifications = notifications !== undefined;
    const hasUi = ui !== undefined;
    if (!hasNotifications && !hasUi) { res.status(400).json({ success: false, code: "RVB_PREFERENCES_INVALID" }); return; }
    if (hasNotifications && (typeof notifications !== "object" || Array.isArray(notifications))) { res.status(400).json({ success: false, code: "RVB_PREFERENCES_INVALID" }); return; }
    if (hasUi && (typeof ui !== "object" || Array.isArray(ui))) { res.status(400).json({ success: false, code: "RVB_PREFERENCES_INVALID" }); return; }

    const account: any = await RvbAccountModel.findOne({ id: user.accountId });
    if (!account) { res.status(404).json({ success: false, code: "RVB_ACCOUNT_NOT_FOUND" }); return; }
    const current = account.preferences || {};
    const next: any = { ...current };

    if (hasNotifications) {
      const sanitized: any = {};
      for (const k of allowedNotifKeys) {
        if (k in notifications) sanitized[k] = !!notifications[k];
      }
      // If client sent empty notifications object, treat as no-op for that group? Keep existing
      if (Object.keys(sanitized).length === 0 && Object.keys(notifications).length > 0) {
        // invalid keys only, but not error; preserve existing
      } else if (Object.keys(sanitized).length > 0) {
        next.notifications = { ...(current.notifications || {}), ...sanitized };
      } else if (!current.notifications) {
        next.notifications = {};
      }
      // Fill defaults for missing keys
      const allDefaults = { chats: true, mentions: true, requests: true, orders: true, statusUpdates: true, reminders: true } as any;
      if (!next.notifications) next.notifications = { ...allDefaults };
      for (const k of allowedNotifKeys) if (!(k in next.notifications)) next.notifications[k] = true;
    } else {
      // ensure notifications defaults exist even if not being updated
      if (!next.notifications) next.notifications = { chats: true, mentions: true, requests: true, orders: true, statusUpdates: true, reminders: true };
      else {
        const allDefaults = { chats: true, mentions: true, requests: true, orders: true, statusUpdates: true, reminders: true } as any;
        for (const k of allowedNotifKeys) if (!(k in next.notifications)) next.notifications[k] = true;
      }
    }

    if (hasUi) {
      const sanitizedUi: any = {};
      if ("language" in ui) {
        const l = String(ui.language).trim();
        if (!["en", "fr", "ar"].includes(l)) { res.status(400).json({ success: false, code: "RVB_LANGUAGE_INVALID" }); return; }
        sanitizedUi.language = l;
      }
      if ("theme" in ui) {
        const th = String(ui.theme).trim();
        if (!["light", "dark"].includes(th)) { res.status(400).json({ success: false, code: "RVB_THEME_INVALID" }); return; }
        sanitizedUi.theme = th;
      }
      if (Object.keys(sanitizedUi).length === 0) { res.status(400).json({ success: false, code: "RVB_PREFERENCES_INVALID" }); return; }
      next.ui = { ...(current.ui || {}), ...sanitizedUi };
      // Fill defaults for missing ui keys if partially present
      if (!next.ui.language) next.ui.language = "en";
      if (!next.ui.theme) next.ui.theme = "light";
    } else {
      // ensure ui defaults exist for future reads, but do not overwrite if already present
      if (!next.ui) next.ui = { language: "en", theme: "light" };
      else {
        if (!next.ui.language) next.ui.language = "en";
        if (!next.ui.theme) next.ui.theme = "light";
      }
    }

    account.preferences = next;
    account.updatedAt = Date.now();
    await account.save();
    res.json({ success: true, preferences: next });
  } catch (e) {
    console.error("patch preferences failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/auth/preferences
router.get("/preferences", requireRvbAuth as any, async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const account: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    if (!account) { res.status(404).json({ success: false, code: "RVB_ACCOUNT_NOT_FOUND" }); return; }
    const prefs: any = account.preferences || {};
    // Ensure notifications defaults
    const defaults = { chats: true, mentions: true, requests: true, orders: true, statusUpdates: true, reminders: true } as any;
    if (!prefs.notifications || typeof prefs.notifications !== "object") prefs.notifications = { ...defaults };
    for (const k of Object.keys(defaults) as any[]) if (!(k in (prefs.notifications || {}))) prefs.notifications[k] = (defaults as any)[k];
    // Ensure ui defaults
    if (!prefs.ui || typeof prefs.ui !== "object") prefs.ui = { language: "en", theme: "light" };
    else {
      if (!["en", "fr", "ar"].includes(prefs.ui.language)) prefs.ui.language = "en";
      if (!["light", "dark"].includes(prefs.ui.theme)) prefs.ui.theme = "light";
    }
    res.json({ success: true, preferences: prefs });
  } catch (e) {
    console.error("get preferences failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/auth/sessions - list sessions for current account
router.get("/sessions", requireRvbAuth as any, async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const sessions: any[] = await RvbSessionModel.find({ accountId: user.accountId, revokedAt: null, expiresAt: { $gt: Date.now() } }).sort({ lastUsedAt: -1 }).lean();
    const safe = sessions.map((s: any) => ({ id: s.id, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, expiresAt: s.expiresAt, userAgent: s.userAgent || null, ipAddress: s.ipAddress || null, isCurrent: s.id === user.sessionId }));
    res.json({ success: true, sessions: safe, currentSessionId: user.sessionId });
  } catch (e) {
    console.error("get sessions failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/auth/sessions/revoke-others
router.post("/sessions/revoke-others", requireRvbAuth as any, async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    await RvbSessionModel.updateMany({ accountId: user.accountId, revokedAt: null, id: { $ne: user.sessionId } } as any, { $set: { revokedAt: Date.now() } } as any);
    safeDisconnectAccountExcept(user.accountId, user.sessionId);
    res.json({ success: true });
  } catch (e) {
    console.error("revoke others failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/auth/change-password - per-account rate limit (after auth)
router.post("/change-password", requireRvbAuth as any, rateLimit({ windowMs: 60 * 1000, max: 20, key: accountKey }) as any, async (req: RvbAuthRequest, res) => {
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
        const sessClientType: "web" | "native" = (sess as any).clientType === "native" ? "native" : "web";
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
          clientType: sessClientType,
        } as any);
        setRefreshCookie(res, newRefreshToken);
        // Disconnect all other sessions except the new rotated one (old current is revoked but new remains)
        safeDisconnectAccountExcept(account.id, newSessionId);
        // Determine from trusted session metadata not forged header: if native, return refreshToken in JSON
        if (sessClientType === "native") {
          res.json({ success: true, accessToken: newAccessToken, refreshToken: newRefreshToken, account: toSafeRvbAccount(account) });
          return;
        }
        res.json({ success: true, accessToken: newAccessToken, account: toSafeRvbAccount(account) });
        return;
      }
    }

    // No rotation (session missing or already revoked): disconnect others except current
    safeDisconnectAccountExcept(account.id, currentSessionId);
    res.json({ success: true, account: toSafeRvbAccount(account) });
  } catch (e) {
    console.error("change-password failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

export default router;
