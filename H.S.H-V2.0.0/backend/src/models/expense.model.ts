import { Schema, model, type InferSchemaType } from "mongoose";

const expenseSchema = new Schema(
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

    amount: {
      type: Number,
      required: true,
    },

    accountId: {
      type: String,
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
    collection: "expenses",
    versionKey: false,
  },
);

export type ExpenseDocument = InferSchemaType<typeof expenseSchema>;

export const ExpenseModel = model<ExpenseDocument>(
  "Expense",
  expenseSchema,
);

