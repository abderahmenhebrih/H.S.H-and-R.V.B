import { Schema, model, type InferSchemaType } from "mongoose";

const orderItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    quantity: { type: Number, required: true },
    weightKg: { type: Number, required: true },
    price: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const customerOrderSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    customerId: { type: String, required: true, index: true },
    accountId: { type: String, required: false, default: null },
    status: { type: String, enum: ["under_review", "accepted", "rejected", "cancelled"], required: true, default: "under_review" },
    items: { type: [orderItemSchema], required: true },
    total: { type: Number, required: true },
    submittedAt: { type: Number, required: true },
    updatedAtOrder: { type: Number, required: false },
    reviewedAt: { type: Number, required: false, default: null },
    reviewedBy: { type: String, required: false, default: null },
    cancelledAt: { type: Number, required: false, default: null },
    notes: { type: String, required: false, default: null },
    originalItems: { type: [orderItemSchema], required: false, default: null },
    // Client-generated idempotency identity for order creation. Absent
    // (undefined) on all legacy docs. Uniqueness is enforced ONLY for orders
    // where clientRequestId is actually a string, via the partial unique
    // index below — a compound sparse index would be insufficiently precise
    // for legacy rows. Scoped by accountId: two different actors may
    // coincidentally use the same key.
    clientRequestId: { type: String, required: false, default: undefined },
  },
  {
    collection: "customer_orders",
    versionKey: false,
  },
);

customerOrderSchema.index({ status: 1 });
customerOrderSchema.index({ customerId: 1, submittedAt: -1 });
// Race-proof duplicate protection: two simultaneous creates with the same
// actor + key cannot both insert (second hits E11000 and replays the winner).
// PARTIAL (not sparse): uniqueness applies only where clientRequestId is a
// string, so any number of legacy keyless orders coexist for one account.
// Explicit stable name shared with ensureCustomerOrderIdempotencyIndex below
// (Mongoose autoIndex in non-production builds the identical spec).
customerOrderSchema.index(
  { accountId: 1, clientRequestId: 1 },
  {
    unique: true,
    name: "customer_order_account_idempotency_unique",
    partialFilterExpression: { clientRequestId: { $type: "string" } },
  },
);

export type CustomerOrderDocument = InferSchemaType<typeof customerOrderSchema>;

export const CustomerOrderModel = model<CustomerOrderDocument>("CustomerOrder", customerOrderSchema);

const IDEMPOTENCY_INDEX_SPEC = { accountId: 1, clientRequestId: 1 } as const;
const IDEMPOTENCY_INDEX_NAME = "customer_order_account_idempotency_unique";
const IDEMPOTENCY_INDEX_FILTER = { clientRequestId: { $type: "string" } } as const;

// Exact known production-test family that generated idempotency duplicates
// (concurrency acceptance rounds). Narrow by design: no other prefix is
// eligible for automatic remediation.
const KNOWN_IDEMPOTENCY_QA_PREFIX = "QA-MOBILE-IDEMP-PROD-";

// Strict QA predicate for automatic key unsetting. BOTH conditions required:
// the exact known idempotency-test marker AND a safe terminal state, so an
// in-flight Under Review QA order is never silently detached from its key.
// Anything else in a duplicate group aborts the whole group with manual
// review (zero documents in that group modified).
function isKnownIdempotencyQaRecord(doc: any): boolean {
  return (
    typeof doc?.notes === "string" &&
    doc.notes.startsWith(KNOWN_IDEMPOTENCY_QA_PREFIX) &&
    doc.status === "cancelled"
  );
}

function hasIntendedFilter(filter: unknown): boolean {
  if (!filter || typeof filter !== "object") return false;
  const f = filter as Record<string, any>;
  const keys = Object.keys(f);
  if (keys.length !== 1 || keys[0] !== "clientRequestId") return false;
  const inner = f.clientRequestId;
  if (!inner || typeof inner !== "object") return false;
  const innerKeys = Object.keys(inner);
  return innerKeys.length === 1 && innerKeys[0] === "$type" && inner.$type === "string";
}

function hasIntendedKeys(key: unknown): boolean {
  if (!key || typeof key !== "object") return false;
  const k = key as Record<string, unknown>;
  const keys = Object.keys(k);
  return keys.length === 2 && k.accountId === 1 && k.clientRequestId === 1;
}

// Required production index initializer: explicit, idempotent, safe to run
// on every backend startup, limited to this single index (never drops or
// touches any index, including incompatible ones). Fails LOUDLY (throws)
// when uniqueness cannot be established — callers must not swallow this:
// without the index, order idempotency is not concurrency-safe.
export async function ensureCustomerOrderIdempotencyIndex(): Promise<void> {
  const coll: any = (CustomerOrderModel as any).collection;
  const listIndexesSafely = async (): Promise<any[] | null> => {
    try {
      return await coll.listIndexes().toArray();
    } catch (e: any) {
      // Namespace may not exist yet on a fresh DB — nothing to remediate.
      if (e?.code === 26 || e?.codeName === "NamespaceNotFound") return null;
      throw e;
    }
  };

  const indexes = await listIndexesSafely();
  if (indexes) {
    const named = indexes.find((idx: any) => idx?.name === IDEMPOTENCY_INDEX_NAME);
    if (named) {
      // Same name must mean the exact intended contract. Anything else is an
      // incompatible conflict: report loudly, never auto-drop, never trust.
      if (
        named.unique === true &&
        hasIntendedKeys(named.key) &&
        hasIntendedFilter(named.partialFilterExpression)
      ) {
        // eslint-disable-next-line no-console
        console.log("[customer-order] idempotency unique index already enforced");
        return;
      }
      throw new Error(
        `[customer-order] FATAL: incompatible index already owns name ${IDEMPOTENCY_INDEX_NAME} ` +
          `(keys=${JSON.stringify(named.key)} unique=${named.unique}). ` +
          `Refusing to drop or overwrite automatically: resolve manually.`,
      );
    }
    // Any OTHER unique index on the same keys without the intended partial
    // filter is equally untrustworthy (e.g. plain unique would collide on
    // legacy keyless rows): fail loudly rather than coexist silently.
    const rogue = indexes.find(
      (idx: any) => idx?.unique === true && hasIntendedKeys(idx?.key) && !hasIntendedFilter(idx?.partialFilterExpression),
    );
    if (rogue) {
      throw new Error(
        `[customer-order] FATAL: incompatible unique index '${rogue.name}' covers { accountId, clientRequestId } ` +
          `without the required partial filter. Refusing to proceed: resolve manually.`,
      );
    }
  }

  // Scan for existing collisions before creating the unique constraint.
  // Uniqueness applies to stored documents regardless of order status, so
  // cancelled QA duplicates from concurrency testing still collide.
  const colliding = async (): Promise<any[]> => {
    try {
      return await coll
        .aggregate([
          { $match: { clientRequestId: { $type: "string" } } },
          {
            $group: {
              _id: { accountId: "$accountId", clientRequestId: "$clientRequestId" },
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
        ])
        .toArray();
    } catch (e: any) {
      if (e?.code === 26 || e?.codeName === "NamespaceNotFound") return [];
      throw e;
    }
  };

  const remediateQaDuplicates = async (): Promise<{ groups: number; unsets: number }> => {
    const groups = await colliding();
    // PASS 1 — validate every group BEFORE mutating anything: a single
    // non-QA document aborts its whole group with zero modifications there.
    const validated: { key: any; docs: any[] }[] = [];
    for (const g of groups) {
      const key = g?._id || {};
      const docs: any[] = await coll
        .find({ accountId: key.accountId, clientRequestId: key.clientRequestId })
        .sort({ createdAt: 1, _id: 1 })
        .toArray();
      if (docs.length <= 1) continue;
      const nonQa = docs.filter((d) => !isKnownIdempotencyQaRecord(d));
      if (nonQa.length > 0) {
        throw new Error(
          `REAL DUPLICATE IDEMPOTENCY DATA REQUIRES MANUAL REVIEW ` +
            `accountId=${JSON.stringify(key.accountId)} clientRequestId=${JSON.stringify(key.clientRequestId)} ` +
            `docs=${docs.map((d) => String(d?.id || d?._id)).join(",")}`,
        );
      }
      validated.push({ key, docs });
    }
    // PASS 2 — remediate validated QA-only groups: preserve ONE canonical
    // document (earliest), unset the key on surplus audit records (records
    // kept, collisions removed).
    let unsets = 0;
    for (const { docs } of validated) {
      const surplusIds = docs.slice(1).map((d) => d._id);
      if (surplusIds.length > 0) {
        await coll.updateMany({ _id: { $in: surplusIds } }, { $unset: { clientRequestId: "" } });
        unsets += surplusIds.length;
      }
    }
    return { groups: validated.length, unsets };
  };

  const create = async (): Promise<void> => {
    await coll.createIndex(IDEMPOTENCY_INDEX_SPEC as any, {
      unique: true,
      name: IDEMPOTENCY_INDEX_NAME,
      partialFilterExpression: { clientRequestId: { $type: "string" } },
    });
  };

  const isDuplicateDataError = (e: any): boolean =>
    e?.code === 11000 || e?.codeName === "DuplicateKey" || /duplicate key/i.test(String(e?.message || ""));

  const first = await remediateQaDuplicates();
  try {
    await create();
  } catch (e: any) {
    // Retry the scan exactly once ONLY when the failure could actually be
    // duplicate data landing between scan and creation. Permission, network,
    // and index-options conflicts fail immediately with the original error.
    if (!isDuplicateDataError(e)) throw e;
    // eslint-disable-next-line no-console
    console.warn("[customer-order] idempotency index create hit duplicate data, rescanning once:", e?.message);
    await remediateQaDuplicates();
    await create();
  }
  // eslint-disable-next-line no-console
  console.log(
    `[customer-order] idempotency unique index ensured (${IDEMPOTENCY_INDEX_NAME}) ` +
      `duplicateGroups=${first.groups} qaKeysUnset=${first.unsets}`,
  );
}
