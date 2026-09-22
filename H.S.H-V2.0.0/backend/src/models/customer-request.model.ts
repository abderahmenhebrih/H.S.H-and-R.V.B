import { Schema, model, type InferSchemaType } from "mongoose";

const customerRequestSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    customerId: { type: String, required: true, index: true },
    accountId: { type: String, required: false, default: null },
    type: { type: String, enum: ["insert_shipment", "discrepancy"], required: true },
    status: { type: String, enum: ["under_review", "accepted", "rejected"], required: true, default: "under_review" },
    // For insert_shipment: structured sale-like data
    items: { type: Schema.Types.Mixed, required: false, default: null },
    total: { type: Number, required: false, default: null },
    date: { type: Number, required: false, default: null },
    description: { type: String, required: false, default: null },
    submittedAt: { type: Number, required: true },
    reviewedAt: { type: Number, required: false, default: null },
    reviewedBy: { type: String, required: false, default: null },
    notes: { type: String, required: false, default: null },
    // Idempotency: store created saleId if accepted
    saleId: { type: String, required: false, default: null },
    // Preserve original submission when management edits before accept
    originalItems: { type: Schema.Types.Mixed, required: false, default: null },
    originalTotal: { type: Number, required: false, default: null },
  },
  {
    collection: "customer_requests",
    versionKey: false,
  },
);

customerRequestSchema.index({ customerId: 1, createdAt: -1 });
customerRequestSchema.index({ status: 1 });
customerRequestSchema.index({ submittedAt: -1 });

export type CustomerRequestDocument = InferSchemaType<typeof customerRequestSchema>;

export const CustomerRequestModel = model<CustomerRequestDocument>("CustomerRequest", customerRequestSchema);
