import { Schema, model, type InferSchemaType } from "mongoose";

const transferSchema = new Schema(
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

    fromAccountId: {
      type: String,
      required: true,
    },

    toAccountId: {
      type: String,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    date: {
      type: Number,
      required: true,
    },

    note: {
      type: String,
      required: false,
    },
  },
  {
    collection: "transfers",
    versionKey: false,
  },
);

export type TransferDocument = InferSchemaType<typeof transferSchema>;

export const TransferModel = model<TransferDocument>(
  "Transfer",
  transferSchema,
);

