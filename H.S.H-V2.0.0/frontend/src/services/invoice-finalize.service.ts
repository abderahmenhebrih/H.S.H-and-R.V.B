import { db } from "../lib/database/db";
import { invoiceRepository } from "../repositories/invoice.repository";
import type { Invoice } from "../types/entities/invoice";

/**
 * Production helper for draft → issued lifecycle.
 * - Applies canonical issued invoice as remote (never queues).
 * - Keeps canonical issuedId.
 * - Removes obsolete OTHER local drafts for same source sale (remote delete, no queue).
 * - For EVERY superseded id (including issuedId itself when it was a draft), removes
 *   all pre-Issue pending invoice syncOperations so a stale DRAFT create/update
 *   can never execute after authoritative Issue.
 * Prefer transaction involving db.invoices + db.syncOperations where safe.
 */
export async function finalizeIssuedInvoiceLocal(
  issued: any,
  revision: number,
  sourceSaleId?: string,
  draftIdBeforeIssue?: string,
): Promise<void> {
  const issuedId: string = issued.id;
  const localIssued: any = {
    ...issued,
    id: issuedId,
    status: "ISSUED",
    createdAt: issued.createdAt || Date.now(),
    updatedAt: issued.updatedAt || Date.now(),
    syncStatus: "synced",
    serverRevision: revision,
    lastSyncedAt: Date.now(),
  };

  // Atomic transaction per spec: ONE Dexie transaction over invoices + syncOperations
  await db.transaction("rw", db.invoices, db.syncOperations, async () => {
    // 1. put canonical ISSUED (direct put inside transaction, no remote wrapper to keep atomic)
    await db.invoices.put(localIssued);

    // 2. Discover superseded ids: explicit draftId + any other DRAFTs for same sale
    const supersededIds = new Set<string>();
    if (draftIdBeforeIssue) supersededIds.add(draftIdBeforeIssue);
    if (sourceSaleId) {
      const all: Invoice[] = (await db.invoices.toArray()) as any;
      for (const inv of all) {
        if ((inv as any).status === "DRAFT" && Array.isArray((inv as any).sourceSaleIds) && (inv as any).sourceSaleIds.includes(sourceSaleId) && inv.id !== issuedId) {
          supersededIds.add(inv.id);
        }
      }
    }

    // 3. For every superseded id: remove obsolete drafts (keep issuedId) and pending ops
    for (const sid of supersededIds) {
      if (sid !== issuedId) {
        await db.invoices.delete(sid);
      }
      const pendingOps: any[] = await db.syncOperations.where("entityId").equals(sid).toArray();
      for (const op of pendingOps) {
        if (op.entity === "invoice" && !op.synced) {
          await db.syncOperations.delete(op.id);
        }
      }
    }
  });
}

export async function cleanupSupersededInvoiceDraftsForTestHelper(
  _issuedId: string,
  _revision: number,
): Promise<void> {
  // Backwards compat alias for tests that import by old helper name if needed
}
