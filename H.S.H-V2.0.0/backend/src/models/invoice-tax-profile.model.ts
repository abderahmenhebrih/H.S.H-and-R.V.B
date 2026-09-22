import { Schema, model, type InferSchemaType } from "mongoose";

const invoiceTaxProfileSchema = new Schema(
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
    },

    code: {
      type: String,
      required: true,
    },

    vatRate: {
      type: Number,
      required: true,
    },

    otherTaxRate: {
      type: Number,
      required: false,
      default: 0,
    },

    otherTaxLabel: {
      type: String,
      required: false,
    },

    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    collection: "invoiceTaxProfiles",
    versionKey: false,
  },
);

export type InvoiceTaxProfileDocument = InferSchemaType<typeof invoiceTaxProfileSchema>;

export const InvoiceTaxProfileModel = model<InvoiceTaxProfileDocument>(
  "InvoiceTaxProfile",
  invoiceTaxProfileSchema,
);
