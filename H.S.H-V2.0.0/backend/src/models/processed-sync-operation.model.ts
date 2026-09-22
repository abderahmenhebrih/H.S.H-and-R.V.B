import { Schema, model, type InferSchemaType } from "mongoose";

const processedSyncOperationSchema = new Schema(
  {
    operationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    entity: {
      type: String,
      required: true,
    },
    entityId: {
      type: String,
      required: true,
    },
    operation: {
      type: String,
      enum: ["create", "update", "delete", "upsert"],
      required: true,
    },
    success: {
      type: Boolean,
      required: true,
    },
    revision: {
      type: Number,
      required: false,
    },
    canonicalEntity: {
      type: Schema.Types.Mixed,
      required: false,
    },
    conflict: {
      type: Boolean,
      required: false,
    },
    error: {
      type: String,
      required: false,
    },
    retryable: {
      type: Boolean,
      required: false,
      default: false,
    },
    processedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    clientId: {
      type: String,
      required: false,
    },
  },
  {
    collection: "processedSyncOperations",
    versionKey: false,
  },
);

export type ProcessedSyncOperationDocument = InferSchemaType<typeof processedSyncOperationSchema>;

export const ProcessedSyncOperationModel = model<ProcessedSyncOperationDocument>(
  "ProcessedSyncOperation",
  processedSyncOperationSchema,
);
