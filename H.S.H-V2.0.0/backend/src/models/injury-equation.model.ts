import { Schema, model, type InferSchemaType } from "mongoose";

const injuryEquationSchema = new Schema(
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

    productId: {
      type: String,
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    inputVariable: {
      type: String,
      enum: ["A"],
      required: true,
    },

    outputVariable: {
      type: String,
      enum: ["B"],
      required: true,
    },

    equation: {
      type: String,
      required: true,
    },

    enabled: {
      type: Boolean,
      required: true,
    },
  },
  {
    collection: "injuryEquations",
    versionKey: false,
  },
);

export type InjuryEquationDocument =
  InferSchemaType<typeof injuryEquationSchema>;

export const InjuryEquationModel = model<InjuryEquationDocument>(
  "InjuryEquation",
  injuryEquationSchema,
);

