import { Schema, model, type InferSchemaType } from "mongoose";

const incomingInvoiceSchema = new Schema(
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

    supplierInvoiceNumber: {
      type: String,
      required: true,
    },

    invoiceDate: {
      type: Number,
      required: true,
    },

    amountHT: {
      type: Number,
      required: true,
    },

    taxAmount: {
      type: Number,
      required: false,
      default: 0,
    },

    amountTTC: {
      type: Number,
      required: true,
    },

    currencyCode: {
      type: String,
      required: true,
    },

    purchaseReference: {
      type: String,
      required: false,
    },

    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIALLY_PAID", "PAID"],
      required: false,
      default: "UNPAID",
    },

    notes: {
      type: String,
      required: false,
    },

    attachment: {
      type: String,
      required: false,
    },
  },
  {
    collection: "incomingInvoices",
    versionKey: false,
  },
);

incomingInvoiceSchema.index({ supplierId: 1, supplierInvoiceNumber: 1 }, { unique: true });

export type IncomingInvoiceDocument = InferSchemaType<typeof incomingInvoiceSchema>;

export const IncomingInvoiceModel = model<IncomingInvoiceDocument>(
  "IncomingInvoice",
  incomingInvoiceSchema,
);
