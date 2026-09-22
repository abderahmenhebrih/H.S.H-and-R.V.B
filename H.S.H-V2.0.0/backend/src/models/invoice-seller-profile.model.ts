import { Schema, model, type InferSchemaType } from "mongoose";

const invoiceSellerProfileSchema = new Schema(
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

    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },

    commercialName: {
      type: String,
      required: true,
    },

    legalDenomination: {
      type: String,
      required: false,
    },

    legalForm: {
      type: String,
      required: false,
    },

    activity: {
      type: String,
      required: false,
    },

    address: {
      type: String,
      required: false,
    },

    city: {
      type: String,
      required: false,
    },

    wilaya: {
      type: String,
      required: false,
    },

    phone: {
      type: String,
      required: false,
    },

    email: {
      type: String,
      required: false,
    },

    fax: {
      type: String,
      required: false,
    },

    rc: {
      type: String,
      required: false,
    },

    nif: {
      type: String,
      required: false,
    },

    nis: {
      type: String,
      required: false,
    },

    capital: {
      type: String,
      required: false,
    },

    bankName: {
      type: String,
      required: false,
    },

    bankAccount: {
      type: String,
      required: false,
    },

    rib: {
      type: String,
      required: false,
    },

    logo: {
      type: String,
      required: false,
    },

    stampImage: {
      type: String,
      required: false,
    },

    invoicePrefix: {
      type: String,
      required: true,
    },

    nextNumber: {
      type: Number,
      required: true,
    },

    paddingLength: {
      type: Number,
      required: true,
      default: 6,
    },

    yearResetPolicy: {
      type: String,
      enum: ["never", "yearly"],
      required: true,
      default: "never",
    },

    defaultPaymentTerms: {
      type: String,
      required: false,
    },

    defaultPaymentMethodId: {
      type: String,
      required: false,
    },

    defaultTaxProfileId: {
      type: String,
      required: false,
    },

    defaultCurrency: {
      type: String,
      required: false,
    },

    lastSequenceYear: {
      type: Number,
      required: false,
    },
  },
  {
    collection: "invoiceSellerProfiles",
    versionKey: false,
  },
);

export type InvoiceSellerProfileDocument = InferSchemaType<typeof invoiceSellerProfileSchema>;

export const InvoiceSellerProfileModel = model<InvoiceSellerProfileDocument>(
  "InvoiceSellerProfile",
  invoiceSellerProfileSchema,
);
