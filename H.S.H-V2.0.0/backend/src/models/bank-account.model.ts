import { Schema, model, type InferSchemaType } from "mongoose";

const bankAccountSchema = new Schema(
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

    type: {
      type: String,
      enum: ["cash", "bank"],
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    initialBalance: {
      type: Number,
      required: true,
    },

    balance: {
      type: Number,
      required: true,
    },

    notes: {
      type: String,
      required: false,
    },
  },
  {
    collection: "bankAccounts",
    versionKey: false,
  },
);

export type BankAccountDocument =
  InferSchemaType<typeof bankAccountSchema>;

export const BankAccountModel = model<BankAccountDocument>(
  "BankAccount",
  bankAccountSchema,
);

