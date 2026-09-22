import { Router } from "express";
import { requireRvbAuth } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import * as actSvc from "../services/rvb-activity.service";

const router = Router();
router.use(requireRvbAuth as any);

// GET /api/rvb/activities?source=&search=&date=&actor=&page=&limit=
router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { source, search, date, actor, page, limit } = req.query as any;
    const result = await actSvc.listActivitiesForUser({
      accountId: user.accountId,
      role: user.role,
      source: source || "all",
      search: search ? String(search) : undefined,
      date: date || "all",
      actor: actor ? String(actor) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(e?.status || 500).json({ success: false, code: e?.code || "INTERNAL_ERROR", message: e?.message });
  }
});

export default router;
