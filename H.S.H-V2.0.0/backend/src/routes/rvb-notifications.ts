import { Router } from "express";
import { requireRvbAuth } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import * as notifSvc from "../services/rvb-notification.service";

const router = Router();
router.use(requireRvbAuth as any);

// GET /api/rvb/notifications?status=&source=&priority=&date=&search=&page=&limit=
router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { status, source, priority, date, search, page, limit } = req.query as any;
    const result = await notifSvc.listNotificationsForUser({
      accountId: user.accountId,
      role: user.role,
      status: status || "all",
      source: source || "all",
      priority: priority || "all",
      date: date || "all",
      search: search ? String(search) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(e?.status || 500).json({ success: false, code: e?.code || "INTERNAL_ERROR", message: e?.message });
  }
});

// GET /api/rvb/notifications/count
router.get("/count", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { unreadCount, archivedCount } = await notifSvc.listNotificationsForUser({
      accountId: user.accountId,
      role: user.role,
      status: "all",
      page: 1,
      limit: 1,
    });
    // list returns counts, but we can just send those
    res.json({ success: true, unreadCount, archivedCount });
  } catch (e: any) {
    res.status(e?.status || 500).json({ success: false, code: e?.code || "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/notifications/mark-all-read
router.post("/mark-all-read", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const r = await notifSvc.markAllRead(user.accountId, user.role);
    res.json({ success: true, ...r });
  } catch (e: any) {
    res.status(e?.status || 500).json({ success: false, code: e?.code || "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/notifications/bulk { ids, action }
router.post("/bulk", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { ids, action } = req.body as any;
    const r = await notifSvc.bulkUpdate(user.accountId, user.role, ids, action);
    res.json({ success: true, ...r });
  } catch (e: any) {
    res.status(e?.status || 500).json({ success: false, code: e?.code || "INTERNAL_ERROR", message: e?.message, details: e?.details });
  }
});

// POST /api/rvb/notifications/:id/read { unread?: boolean }
router.post("/:id/read", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const id = String((req.params as any).id);
    const { unread } = req.body as any;
    const doc = await notifSvc.markNotificationRead(id, user.accountId, user.role, !!unread);
    res.json({ success: true, notification: doc });
  } catch (e: any) {
    res.status(e?.status || 500).json({ success: false, code: e?.code || "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/notifications/:id/archive { archived?: boolean }  archived true -> archive, false -> restore
router.post("/:id/archive", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const id = String((req.params as any).id);
    const { archived } = req.body as any;
    const doArch = archived !== false; // default true
    const doc = await notifSvc.archiveNotification(id, user.accountId, user.role, doArch);
    res.json({ success: true, notification: doc });
  } catch (e: any) {
    res.status(e?.status || 500).json({ success: false, code: e?.code || "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/notifications/:id/restore -> shortcut
router.post("/:id/restore", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const id = String((req.params as any).id);
    const doc = await notifSvc.archiveNotification(id, user.accountId, user.role, false);
    res.json({ success: true, notification: doc });
  } catch (e: any) {
    res.status(e?.status || 500).json({ success: false, code: e?.code || "INTERNAL_ERROR" });
  }
});

export default router;
