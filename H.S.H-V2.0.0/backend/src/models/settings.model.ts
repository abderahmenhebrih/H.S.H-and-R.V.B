import { Schema, model, type InferSchemaType } from "mongoose";

const settingsSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },

    language: {
      type: String,
      enum: ["ar", "fr", "en"],
      required: true,
    },

    currency: {
      type: String,
      enum: ["DA", "€", "$"],
      required: true,
    },

    customerTypes: {
      type: [String],
      required: true,
    },

    workerPositions: {
      type: [String],
      required: true,
    },

    vehicleTypes: {
      type: [String],
      required: true,
    },

    expenseTypes: {
      type: [String],
      required: false,
      default: [],
    },

    notifications: {
      inAppEnabled: { type: Boolean, required: false },
      desktopEnabled: { type: Boolean, required: false },
      soundEnabled: { type: Boolean, required: false },
      customerOrders: { type: Boolean, required: false },
      tasks: { type: Boolean, required: false },
      inventory: { type: Boolean, required: false },
      financial: { type: Boolean, required: false },
      system: { type: Boolean, required: false },
    },

    invoicePaymentMethods: {
      type: [
        {
          id: { type: String, required: true },
          label: { type: String, required: true },
          enabled: { type: Boolean, required: true },
          isCustom: { type: Boolean, required: false, default: false },
        },
      ],
      required: false,
      default: undefined,
    },

    invoiceDocumentDefaults: {
      defaultInvoiceLanguage: { type: String, enum: ["ar", "fr", "en"], required: false },
      defaultCurrency: { type: String, enum: ["DA", "€", "$"], required: false },
      showBankDetails: { type: Boolean, required: false },
      showRC: { type: Boolean, required: false },
      showNIF: { type: Boolean, required: false },
      showNIS: { type: Boolean, required: false },
      showCapital: { type: Boolean, required: false },
      showStamp: { type: Boolean, required: false },
    },

    syncStatus: {
      type: String,
      enum: ["synced", "pending", "failed"],
      required: false,
    },

    lastSyncedAt: {
      type: Number,
      required: false,
    },

    serverRevision: {
      type: Number,
      required: false,
    },
  },
  {
    collection: "settings",
    versionKey: false,
  },
);

export type SettingsDocument = InferSchemaType<typeof settingsSchema>;

export const SettingsModel = model<SettingsDocument>(
  "Settings",
  settingsSchema,
);
