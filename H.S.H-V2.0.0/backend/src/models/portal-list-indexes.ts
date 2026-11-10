/**
 * Best-effort creation of compound indexes backing the RVB portal list
 * endpoints. Every index below mirrors an observed query + sort shape
 * (see routes rvb-portal.ts / rvb-customers.ts / rvb-suppliers.ts):
 *
 * - sales:        find({ customerId })              sort({ date:-1, createdAt:-1 })
 * - purchases:    find({ supplierId })              sort({ date:-1, createdAt:-1 })
 * - payments:     find({ entityType, entityId })    sort({ date:-1, createdAt:-1 })
 *
 * Additive only (no existing index is altered or dropped), idempotent
 * (checked by name before creation), and failure-tolerant — a missing DB
 * must never prevent startup. Call from server boot like the other
 * ensure*Indexes helpers.
 */
import { SaleModel } from "./sale.model";
import { PurchaseModel } from "./purchase.model";
import { PaymentModel } from "./payment.model";

const DESIRED: Array<{ model: any; collection: string; spec: Record<string, 1 | -1>; name: string }> = [
  {
    model: SaleModel,
    collection: "sales",
    spec: { customerId: 1, date: -1, createdAt: -1 },
    name: "customerId_1_date_-1_createdAt_-1",
  },
  {
    model: PurchaseModel,
    collection: "purchases",
    spec: { supplierId: 1, date: -1, createdAt: -1 },
    name: "supplierId_1_date_-1_createdAt_-1",
  },
  {
    model: PaymentModel,
    collection: "payments",
    spec: { entityType: 1, entityId: 1, date: -1, createdAt: -1 },
    name: "entityType_1_entityId_1_date_-1_createdAt_-1",
  },
];

export async function ensurePortalListIndexes(): Promise<void> {
  for (const { model, collection, spec, name } of DESIRED) {
    try {
      const coll: any = (model as any).collection;
      if (!coll || typeof coll.createIndex !== "function") continue;
      // listIndexes fails on collections that do not exist yet; in that
      // case still attempt creation (createIndex creates the collection).
      // Duplicate creation races resolve via the "already exists" guard below.
      try {
        if (typeof coll.listIndexes === "function") {
          const existing: any[] = await coll.listIndexes().toArray();
          if (existing.some((i: any) => i.name === name)) continue;
        }
      } catch {
        // Collection missing or listing unsupported — fall through to create.
      }
      await coll.createIndex(spec, { name });
    } catch (e: any) {
      if (!String(e?.message || "").includes("already exists")) {
        // eslint-disable-next-line no-console
        console.warn(`[portal-indexes] create index failed on ${collection}:`, e?.message);
      }
    }
  }
}
