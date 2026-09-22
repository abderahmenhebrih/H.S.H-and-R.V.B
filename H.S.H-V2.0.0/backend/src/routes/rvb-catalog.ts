import { Router } from "express";
import { requireRvbAuth } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import { ProductModel } from "../models/product.model";

const router = Router();
router.use(requireRvbAuth as any);

// GET /api/rvb/catalog/products?for=supplier|customer -> returns safe fields
router.get("/products", async (req: RvbAuthRequest, res) => {
  try {
    const forParamRaw = (req.query as any).for;
    const forParam = Array.isArray(forParamRaw) ? forParamRaw[0] : forParamRaw;
    const scope = typeof forParam === "string" ? forParam.trim().toLowerCase() : null;
    // Validate for param if provided
    if (scope && !["supplier", "customer"].includes(scope)) {
      res.status(400).json({ success: false, code: "RVB_CATALOG_FOR_INVALID", message: "for must be supplier or customer" });
      return;
    }

    // All authenticated can view catalog; no role filtering needed, but we ensure ownership is not leaked
    const products = await ProductModel.find().sort({ name: 1 }).lean();

    // Safe fields: id, name, price, quantity, weightKg, description, taxProfileId
    // Do not expose internal sync fields beyond light qty? Provide all safe.
    const safe = products.map((p: any) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      quantity: p.quantity,
      weightKg: p.weightKg,
      description: p.description || null,
      taxProfileId: p.taxProfileId || null,
    }));

    res.json({ success: true, for: scope || null, products: safe });
  } catch (e: any) {
    console.error("GET catalog products failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

export default router;
