import { Router } from "express";
import { requireRvbAuth } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import { ProductModel } from "../models/product.model";

const router = Router();
router.use(requireRvbAuth as any);

// GET /api/rvb/catalog/products?for=supplier|customer -> returns safe fields without inventory leak
router.get("/products", async (req: RvbAuthRequest, res) => {
  try {
    const forParamRaw = (req.query as any).for;
    const forParam = Array.isArray(forParamRaw) ? forParamRaw[0] : forParamRaw;
    const scope = typeof forParam === "string" ? forParam.trim().toLowerCase() : null;
    if (!scope || !["supplier", "customer"].includes(scope)) {
      res.status(400).json({ success: false, code: "RVB_CATALOG_FOR_INVALID", message: "for must be supplier or customer" });
      return;
    }

    const role = req.rvbUser!.role;
    // Enforce catalog scope against role
    if (scope === "customer") {
      if (!["customer", "manager", "admin", "supervisor"].includes(role)) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
    } else if (scope === "supplier") {
      if (!["supplier", "manager", "admin"].includes(role)) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
    }

    const products = await ProductModel.find().sort({ name: 1 }).lean();

    // Safe DTOs: never expose exact quantity/weightKg/taxProfileId to portal
    // Customer: id, name, price, description, available (derived, not exact stock)
    // Supplier: id, name, price, description (available optional)
    const safe = products.map((p: any) => {
      const base: any = {
        id: p.id,
        name: p.name,
        price: p.price,
        description: p.description || null,
      };
      // Add available boolean so customer can see if item is orderable without exact inventory
      const qty = Number(p.quantity) || 0;
      const w = Number(p.weightKg) || 0;
      base.available = qty > 0 && w > 0;
      return base;
    });

    res.json({ success: true, for: scope, products: safe });
  } catch (e: any) {
    console.error("GET catalog products failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

export default router;
