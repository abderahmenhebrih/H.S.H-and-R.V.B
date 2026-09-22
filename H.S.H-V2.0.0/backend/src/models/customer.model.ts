import { Schema, model, type InferSchemaType } from "mongoose";

const customerSchema = new Schema(
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

    type: {
      type: String,
      required: true,
    },

    balance: {
      type: Number,
      required: true,
    },

    legalName: { type: String, required: false },
    commercialName: { type: String, required: false },
    legalForm: { type: String, required: false },
    activity: { type: String, required: false },
    billingAddress: { type: String, required: false },
    rc: { type: String, required: false },
    nif: { type: String, required: false },
    nis: { type: String, required: false },
    invoiceCustomerType: { type: String, enum: ["consumer", "business"], required: false, default: "consumer" },
  },
  {
    collection: "customers",
    versionKey: false,
  },
);

export type CustomerDocument = InferSchemaType<typeof customerSchema>;

export const CustomerModel = model<CustomerDocument>(
  "Customer",
  customerSchema,
);

