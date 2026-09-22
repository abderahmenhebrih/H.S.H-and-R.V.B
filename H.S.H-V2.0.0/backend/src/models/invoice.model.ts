import { Schema, model, type InferSchemaType } from "mongoose";

const invoiceLineSchema = new Schema(
  {
    productId: {
      type: String,
      required: false,
    },

    description: {
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

    unit: {
      type: String,
      required: false,
      default: "kg",
    },

    unitPriceHT: {
      type: Number,
      required: true,
    },

    discountType: {
      type: String,
      enum: ["percentage", "fixed", "none"],
      required: false,
      default: "none",
    },

    discountValue: {
      type: Number,
      required: false,
      default: 0,
    },

    discountAmount: {
      type: Number,
      required: false,
      default: 0,
    },

    totalHT: {
      type: Number,
      required: true,
    },

    taxProfileId: {
      type: String,
      required: false,
    },

    taxCode: {
      type: String,
      required: false,
    },

    taxLabel: {
      type: String,
      required: false,
    },

    taxRate: {
      type: Number,
      required: true,
    },

    taxAmount: {
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

    otherTaxAmount: {
      type: Number,
      required: false,
      default: 0,
    },

    totalTTC: {
      type: Number,
      required: true,
    },
  },
  {
    _id: false,
  },
);

const sellerSnapshotSchema = new Schema(
  {
    commercialName: { type: String, required: true },
    legalDenomination: { type: String, required: false },
    legalForm: { type: String, required: false },
    activity: { type: String, required: false },
    address: { type: String, required: false },
    city: { type: String, required: false },
    wilaya: { type: String, required: false },
    phone: { type: String, required: false },
    email: { type: String, required: false },
    fax: { type: String, required: false },
    rc: { type: String, required: false },
    nif: { type: String, required: false },
    nis: { type: String, required: false },
    capital: { type: String, required: false },
    bankName: { type: String, required: false },
    bankAccount: { type: String, required: false },
    rib: { type: String, required: false },
    logo: { type: String, required: false },
    stampImage: { type: String, required: false },
  },
  {
    _id: false,
  },
);

const customerSnapshotSchema = new Schema(
  {
    name: { type: String, required: true },
    legalName: { type: String, required: false },
    commercialName: { type: String, required: false },
    legalForm: { type: String, required: false },
    activity: { type: String, required: false },
    address: { type: String, required: false },
    phone: { type: String, required: false },
    email: { type: String, required: false },
    rc: { type: String, required: false },
    nif: { type: String, required: false },
    nis: { type: String, required: false },
  },
  {
    _id: false,
  },
);

const additionalChargeSchema = new Schema(
  {
    label: { type: String, required: true },
    amount: { type: Number, required: true },
    taxProfileId: { type: String, required: false },
    taxRate: { type: Number, required: false, default: 0 },
    taxAmount: { type: Number, required: false, default: 0 },
    total: { type: Number, required: true },
  },
  {
    _id: false,
  },
);

const invoiceSchema = new Schema(
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

    status: {
      type: String,
      enum: ["DRAFT", "ISSUED", "CANCELLED"],
      required: true,
    },

    sellerProfileId: {
      type: String,
      required: true,
    },

    invoiceNumber: {
      type: String,
      required: false,
    },

    sequenceNumber: {
      type: Number,
      required: false,
    },

    sellerSnapshot: {
      type: sellerSnapshotSchema,
      required: true,
    },

    customerSnapshot: {
      type: customerSnapshotSchema,
      required: true,
    },

    customerId: {
      type: String,
      required: true,
    },

    sourceSaleIds: {
      type: [String],
      required: true,
      default: [],
    },

    invoiceDate: {
      type: Number,
      required: true,
    },

    dueDate: {
      type: Number,
      required: false,
    },

    paymentMethod: {
      type: String,
      required: false,
    },

    paymentMethodId: {
      type: String,
      required: false,
    },

    paymentMethodLabel: {
      type: String,
      required: false,
    },

    documentDefaultsSnapshot: {
      type: {
        showBankDetails: { type: Boolean, required: false, default: true },
        showRC: { type: Boolean, required: false, default: true },
        showNIF: { type: Boolean, required: false, default: true },
        showNIS: { type: Boolean, required: false, default: true },
        showCapital: { type: Boolean, required: false, default: true },
        showStamp: { type: Boolean, required: false, default: true },
      },
      required: false,
    },

    lines: {
      type: [invoiceLineSchema],
      required: true,
    },

    subtotalHT: {
      type: Number,
      required: true,
    },

    discountTotal: {
      type: Number,
      required: true,
      default: 0,
    },

    additionalCharges: {
      type: [additionalChargeSchema],
      required: false,
      default: [],
    },

    additionalChargesTotal: {
      type: Number,
      required: false,
      default: 0,
    },

    taxableBase: {
      type: Number,
      required: true,
    },

    taxTotal: {
      type: Number,
      required: true,
    },

    otherTaxTotal: {
      type: Number,
      required: true,
      default: 0,
    },

    totalTTC: {
      type: Number,
      required: true,
    },

    amountInWords: {
      type: String,
      required: false,
    },

    currencyCode: {
      type: String,
      required: true,
    },

    documentLanguage: {
      type: String,
      enum: ["en", "fr", "ar"],
      required: true,
    },

    notes: {
      type: String,
      required: false,
    },

    cancelledAt: {
      type: Number,
      required: false,
    },

    cancellationReason: {
      type: String,
      required: false,
    },

    issuedAt: {
      type: Number,
      required: false,
    },

    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIALLY_PAID", "PAID"],
      required: false,
      default: "UNPAID",
    },
  },
  {
    collection: "invoices",
    versionKey: false,
  },
);

invoiceSchema.index({ sellerProfileId: 1, invoiceNumber: 1 }, { unique: true, sparse: true });

export type InvoiceDocument = InferSchemaType<typeof invoiceSchema>;

export const InvoiceModel = model<InvoiceDocument>("Invoice", invoiceSchema);
