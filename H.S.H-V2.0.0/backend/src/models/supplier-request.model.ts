import { Schema, model, type InferSchemaType } from "mongoose";

const supplierRequestSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    supplierId: { type: String, required: true, index: true },
    accountId: { type: String, required: false, default: null },
    type: { type: String, enum: ["new_supply", "discrepancy"], required: true },
    status: { type: String, enum: ["under_review", "accepted", "rejected"], required: true, default: "under_review" },
    // For new_supply: store purchase-like data as JSON
    items: { type: Schema.Types.Mixed, required: false, default: null },
    total: { type: Number, required: false, default: null },
    calculation: { type: Schema.Types.Mixed, required: false, default: null },
    date: { type: Number, required: false, default: null },
    description: { type: String, required: false, default: null },
    submittedAt: { type: Number, required: true },
    reviewedAt: { type: Number, required: false, default: null },
    reviewedBy: { type: String, required: false, default: null },
    notes: { type: String, required: false, default: null },
    // For idempotency, store created purchaseId if accepted
    purchaseId: { type: String, required: false, default: null },
    // Preserve original when edit-then-accept
    originalItems: { type: Schema.Types.Mixed, required: false, default: null },
    originalTotal: { type: Number, required: false, default: null },
    originalCalculation: { type: Schema.Types.Mixed, required: false, default: null },
  },
  {
    collection: "supplier_requests",
    versionKey: false,
  },
);

supplierRequestSchema.index({ supplierId: 1, createdAt: -1 });

export type SupplierRequestDocument = InferSchemaType<typeof supplierRequestSchema>;

export const SupplierRequestModel = model<SupplierRequestDocument>("SupplierRequest", supplierRequestSchema);
