import { Schema, model, type InferSchemaType } from "mongoose";

const paymentSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },

    createdAt: {
      type: Number,
      required: true,
    },

    updatedAt: {
      type: Number,
      required: true,
    },

    syncStatus: {
      type: String,
      enum: ["synced", "pending", "failed"],
      required: true,
    },

    lastSyncedAt: {
      type: Number,
      required: false,
    },

    serverRevision: {
      type: Number,
      required: false,
    },

    entityType: {
      type: String,
      enum: ["supplier", "customer", "worker", "expense"],
      required: true,
    },

    entityId: {
      type: String,
      required: true,
    },

    accountId: {
      type: String,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    date: {
      type: Number,
      required: true,
    },

    note: {
      type: String,
      required: false,
    },
  },
  {
    collection: "payments",
    versionKey: false,
  },
);

export type PaymentDocument = InferSchemaType<typeof paymentSchema>;

export const PaymentModel = model<PaymentDocument>(
  "Payment",
  paymentSchema,
);

