import { Schema, model, type InferSchemaType } from "mongoose";

const productSchema = new Schema(
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

    name: {
      type: String,
      required: true,
      unique: true,
    },

    price: {
      type: Number,
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

    description: {
      type: String,
      required: false,
    },

    taxProfileId: {
      type: String,
      required: false,
    },
  },
  {
    collection: "products",
    versionKey: false,
  },
);

export type ProductDocument = InferSchemaType<typeof productSchema>;

export const ProductModel = model<ProductDocument>(
  "Product",
  productSchema,
);

