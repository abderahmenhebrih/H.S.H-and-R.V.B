import { Router } from "express";
import { createSupplierRequest, listSupplierRequests, reviewSupplierRequest } from "../services/supplier-request.service";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";

const router = Router();
router.use(requireRvbAuth as any);

router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { supplierId } = req.query as any;
    const sid = supplierId && !Array.isArray(supplierId) ? supplierId : Array.isArray(supplierId) ? supplierId[0] : undefined;
    const role = user.role;
    if (role === "manager" || role === "admin") {
      const docs = await listSupplierRequests(sid);
      res.json({ success: true, requests: docs });
      return;
    }
    if (role === "supplier") {
      const linkedType = (user.account as any)?.linkedEntityType;
      const linkedId = (user.account as any)?.linkedEntityId;
      if (linkedType !== "supplier" || !linkedId) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
      if (sid && sid !== linkedId) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
      const docs = await listSupplierRequests(linkedId);
      res.json({ success: true, requests: docs });
      return;
    }
    res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
  } catch (e) {
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

router.post("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const role = user.role;
    if (role !== "manager" && role !== "admin" && role !== "supplier") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const { supplierId, type, items, total, calculation, date, description } = req.body as any;
    let effectiveSupplierId = supplierId;
    if (role === "supplier") {
      const linkedType = (user.account as any)?.linkedEntityType;
      const linkedId = (user.account as any)?.linkedEntityId;
      if (linkedType !== "supplier" || !linkedId) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
      if (supplierId && supplierId !== linkedId) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
      effectiveSupplierId = linkedId;
    } else {
      if (!effectiveSupplierId) {
        res.status(400).json({ success: false, code: "RVB_SUPPLIER_REQUIRED" });
        return;
      }
    }
    const created = await createSupplierRequest({
      supplierId: effectiveSupplierId,
      accountId: user.accountId,
      type,
      items,
      total: total !== undefined ? Number(total) : undefined,
      calculation,
      date: date ? Number(date) : undefined,
      description,
    });
    res.status(201).json({ success: true, request: created });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

router.post("/:id/review", requireRvbRole("manager", "admin") as any, async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { status, notes } = req.body as any;
    const reviewerId = req.rvbUser!.accountId;
    const updated = await reviewSupplierRequest(id, status as any, reviewerId, notes);
    res.json({ success: true, request: updated });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

export default router;
