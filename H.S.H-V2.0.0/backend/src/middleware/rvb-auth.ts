import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, toSafeRvbAccount } from "../lib/rvb-auth";
import { RvbAccountModel } from "../models/rvb-account.model";
import { RvbSessionModel } from "../models/rvb-session.model";

export interface RvbAuthRequest extends Request {
  rvbUser?: {
    accountId: string;
    tag: string;
    role: string;
    status: string;
    sessionId: string;
    account?: any;
  };
}

export async function requireRvbAuth(req: RvbAuthRequest, res: Response, next: NextFunction) {
  try {
    let token: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if ((req as any).cookies && (req as any).cookies["rvb_access_token"]) {
      token = (req as any).cookies["rvb_access_token"];
    } else if (req.headers["x-rvb-token"]) {
      token = String(req.headers["x-rvb-token"]);
    }

    if (!token) {
      res.status(401).json({ success: false, code: "RVB_UNAUTHENTICATED", message: "Authentication required" });
      return;
    }

    let payload: any;
    try {
      payload = verifyAccessToken(token);
    } catch {
      res.status(401).json({ success: false, code: "RVB_TOKEN_INVALID", message: "Invalid token" });
      return;
    }

    const accountId = payload.accountId || payload.id;
    const account: any = await RvbAccountModel.findOne({ id: accountId }).lean();
    if (!account) {
      res.status(401).json({ success: false, code: "RVB_UNAUTHENTICATED", message: "Account not found" });
      return;
    }
    if (account.status !== "active") {
      const code = account.status === "archived" ? "RVB_ACCOUNT_ARCHIVED" : "RVB_ACCOUNT_DISABLED";
      res.status(403).json({ success: false, code, message: code });
      return;
    }

    // Immediate session revocation check
    const sessionId = payload.sessionId as string | undefined;
    if (!sessionId) {
      res.status(401).json({ success: false, code: "RVB_SESSION_REVOKED", message: "Session revoked" });
      return;
    }
    const session: any = await RvbSessionModel.findOne({ id: sessionId, accountId, revokedAt: null, expiresAt: { $gt: Date.now() } }).lean();
    if (!session) {
      res.status(401).json({ success: false, code: "RVB_SESSION_REVOKED", message: "Session revoked or expired" });
      return;
    }

    req.rvbUser = {
      accountId: account.id,
      tag: account.tag,
      role: account.role,
      status: account.status,
      sessionId: payload.sessionId,
      account: toSafeRvbAccount(account),
    };
    next();
  } catch (e) {
    console.error("requireRvbAuth error", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
}

export function requireRvbRole(...roles: string[]) {
  return (req: RvbAuthRequest, res: Response, next: NextFunction) => {
    const user = req.rvbUser;
    if (!user) {
      res.status(401).json({ success: false, code: "RVB_UNAUTHENTICATED" });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN", message: "Insufficient role" });
      return;
    }
    next();
  };
}
