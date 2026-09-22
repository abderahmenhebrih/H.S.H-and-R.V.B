import { Schema, model, type InferSchemaType } from "mongoose";

const saleItemSchema = new Schema(
  {
    productId: {
      type: String,
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
    },

    weightKg: {
      type: Number,
      required: true,
    },

    price: {
      type: Number,
      required: true,
    },

    total: {
      type: Number,
      required: true,
    },
  },
  {
    _id: false,
  },
);

const saleSchema = new Schema(
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

    customerId: {
      type: String,
      required: true,
    },

    date: {
      type: Number,
      required: true,
    },

    items: {
      type: [saleItemSchema],
      required: true,
    },

    total: {
      type: Number,
      required: true,
    },
  },
  {
    collection: "sales",
    versionKey: false,
  },
);

export type SaleDocument = InferSchemaType<typeof saleSchema>;

export const SaleModel = model<SaleDocument>(
  "Sale",
  saleSchema,
);

