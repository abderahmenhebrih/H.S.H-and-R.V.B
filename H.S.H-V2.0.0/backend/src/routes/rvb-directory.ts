import { Router } from "express";
import { requireRvbAuth } from "../middleware/rvb-auth";
import { listDirectory, getDirectoryProfile } from "../services/rvb-directory.service";

const router = Router();

router.use(requireRvbAuth as any);

// GET /api/rvb/directory?q=&role=&page=&limit=
router.get("/", async (req, res) => {
  try {
    const q = (req.query.q as string) || (req.query.search as string) || undefined;
    const role = ((req.query.role as string) || "all") as any;
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 24;
    const allowedRoles = ["all", "worker", "supervisor", "supplier", "customer", "management"];
    const safeRole = allowedRoles.includes(role) ? role : "all";
    const result = await listDirectory({ q, role: safeRole, page, limit });
    res.json({ success: true, ...result });
  } catch (e: any) {
    console.error("directory list failed", e);
    res.status(e?.status || 500).json({ success: false, code: e?.code || "INTERNAL_ERROR", message: e?.message });
  }
});

// GET /api/rvb/directory/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await getDirectoryProfile(id);
    res.json({ success: true, account: profile });
  } catch (e: any) {
    res.status(e?.status || 500).json({ success: false, code: e?.code || "RVB_ACCOUNT_NOT_FOUND" });
  }
});

export default router;
