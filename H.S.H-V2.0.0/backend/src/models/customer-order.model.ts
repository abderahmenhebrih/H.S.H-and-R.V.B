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
  },
  {
    collection: "customer_orders",
    versionKey: false,
  },
);

customerOrderSchema.index({ status: 1 });
customerOrderSchema.index({ customerId: 1, submittedAt: -1 });

export type CustomerOrderDocument = InferSchemaType<typeof customerOrderSchema>;

export const CustomerOrderModel = model<CustomerOrderDocument>("CustomerOrder", customerOrderSchema);
