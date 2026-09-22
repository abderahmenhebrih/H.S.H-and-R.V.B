import { Schema, model, type InferSchemaType } from "mongoose";

const supplierSchema = new Schema(
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

    phone: {
      type: String,
      required: true,
    },

    address: {
      type: String,
      required: false,
    },

    identificationNumber: {
      type: String,
      required: false,
    },

    email: {
      type: String,
      required: false,
    },

    notes: {
      type: String,
      required: false,
    },

    balance: {
      type: Number,
      required: true,
    },
  },
  {
    collection: "suppliers",
    versionKey: false,
  },
);

export type SupplierDocument = InferSchemaType<typeof supplierSchema>;

export const SupplierModel = model<SupplierDocument>(
  "Supplier",
  supplierSchema,
);

