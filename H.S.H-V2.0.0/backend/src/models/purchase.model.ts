import { Schema, model, type InferSchemaType } from "mongoose";

const purchaseItemSchema = new Schema(
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

const purchaseCalculationSchema = new Schema(
  {
    weightBeforeSlaughterKg: {
      type: Number,
      required: true,
    },

    weightAfterSlaughterKg: {
      type: Number,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    averageWeightKg: {
      type: Number,
      required: true,
    },

    averageLossPercent: {
      type: Number,
      required: true,
    },

    averageLossKg: {
      type: Number,
      required: true,
    },
  },
  {
    _id: false,
  },
);

const purchaseSchema = new Schema(
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

    supplierId: {
      type: String,
      required: true,
    },

    date: {
      type: Number,
      required: true,
    },

    items: {
      type: [purchaseItemSchema],
      required: true,
    },

    total: {
      type: Number,
      required: true,
    },

    calculation: {
      type: purchaseCalculationSchema,
      required: false,
    },
  },
  {
    collection: "purchases",
    versionKey: false,
  },
);

export type PurchaseDocument = InferSchemaType<typeof purchaseSchema>;

export const PurchaseModel = model<PurchaseDocument>(
  "Purchase",
  purchaseSchema,
);

