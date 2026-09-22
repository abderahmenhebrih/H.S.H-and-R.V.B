import { Router } from "express";
import { RvbAccountModel } from "../models/rvb-account.model";
import {
  createRvbAccount,
  updateRvbAccount,
  archiveRvbAccount,
  reactivateRvbAccount,
  disableRvbAccount,
  setInitialPassword,
  linkRvbAccount,
  unlinkRvbAccount,
} from "../services/rvb-account.service";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import { toSafeRvbAccount } from "../lib/rvb-auth";
import { validatePasswordPolicy } from "../lib/password";

const router = Router();

function handleError(res: any, err: any) {
  const code = err?.code || "INTERNAL_ERROR";
  const status = err?.status || 500;
  const known = [
    "RVB_TAG_REQUIRED",
    "RVB_TAG_INVALID",
    "RVB_TAG_ALREADY_EXISTS",
    "RVB_TAG_IMMUTABLE",
    "RVB_DISPLAY_NAME_REQUIRED",
    "RVB_ROLE_INVALID",
    "RVB_ENTITY_ROLE_MISMATCH",
    "RVB_LINKED_ENTITY_NOT_FOUND",
    "RVB_LINKED_ENTITY_REQUIRED",
    "RVB_ENTITY_ALREADY_LINKED",
    "RVB_ACCOUNT_NOT_FOUND",
    "RVB_ONBOARDING_INVALID",
    "RVB_FIELD_NOT_ALLOWED",
    "RVB_PASSWORD_REQUIRED",
    "RVB_PASSWORD_TOO_SHORT",
    "RVB_PASSWORD_TOO_LONG",
    "RVB_PASSWORD_CONFIRM_MISMATCH",
    "RVB_PASSWORD_ALREADY_SET",
    "RVB_UNAUTHENTICATED",
    "RVB_FORBIDDEN",
  ];
  if (known.includes(code)) {
    res.status(status).json({ success: false, code, message: code });
    return;
  }
  console.error("RVB accounts error:", err);
  res.status(status).json({ success: false, code, message: err?.message || code });
}

// Protect all account management routes: Manager/Admin only
router.use(requireRvbAuth as any, requireRvbRole("manager", "admin") as any);

// GET /api/rvb/accounts
router.get("/", async (_req, res) => {
  try {
    const docs = await RvbAccountModel.find().sort({ createdAt: -1 }).lean();
    const cleaned = docs.map((d: any) => toSafeRvbAccount(d));
    res.json({ success: true, accounts: cleaned });
  } catch (e) {
    console.error("GET rvb accounts failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/accounts/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const doc: any = await RvbAccountModel.findOne({ id }).lean();
    if (!doc) {
      res.status(404).json({ success: false, code: "RVB_ACCOUNT_NOT_FOUND" });
      return;
    }
    res.json({ success: true, account: toSafeRvbAccount(doc) });
  } catch (e) {
    console.error("GET rvb account failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/accounts
router.post("/", async (req, res) => {
  try {
    const { password, confirmPassword } = req.body as any;
    if (!password) {
      res.status(400).json({ success: false, code: "RVB_PASSWORD_REQUIRED" });
      return;
    }
    const policyError = validatePasswordPolicy(password, confirmPassword);
    if (policyError) {
      res.status(400).json({ success: false, code: policyError });
      return;
    }
    const created: any = await createRvbAccount(req.body as any);
    res.status(201).json({ success: true, account: toSafeRvbAccount(created) });
  } catch (err: any) {
    handleError(res, err);
  }
});

// PATCH /api/rvb/accounts/:id
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updated: any = await updateRvbAccount(id, req.body as any);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.post("/:id/archive", async (req, res) => {
  try {
    const { id } = req.params;
    const updated: any = await archiveRvbAccount(id);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.post("/:id/reactivate", async (req, res) => {
  try {
    const { id } = req.params;
    const updated: any = await reactivateRvbAccount(id);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.post("/:id/disable", async (req, res) => {
  try {
    const { id } = req.params;
    const updated: any = await disableRvbAccount(id);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.post("/:id/set-initial-password", async (req, res) => {
  try {
    const { id } = req.params;
    const { password, confirmPassword } = req.body as any;
    const updated: any = await setInitialPassword(id, password, confirmPassword);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.post("/:id/link", async (req, res) => {
  try {
    const { id } = req.params;
    const { workerId, supplierId, customerId, entityId } = req.body as any;
    const raw = workerId || supplierId || customerId || entityId;
    if (!raw || typeof raw !== "string" || !raw.trim()) {
      res.status(400).json({ success: false, code: "RVB_LINKED_ENTITY_REQUIRED" });
      return;
    }
    const updated: any = await linkRvbAccount(id, raw.trim());
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.post("/:id/unlink", async (req, res) => {
  try {
    const { id } = req.params;
    const updated: any = await unlinkRvbAccount(id);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

export default router;
