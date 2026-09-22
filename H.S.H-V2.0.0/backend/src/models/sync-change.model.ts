import { Schema, model, type InferSchemaType } from "mongoose";

const syncChangeSchema = new Schema(
  {
    revision: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    entity: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    operation: {
      type: String,
      enum: ["create", "update", "delete"],
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: false,
    },
    changedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    sourceClientId: {
      type: String,
      required: false,
    },
    operationId: {
      type: String,
      required: false,
      index: true,
    },
  },
  {
    collection: "syncChanges",
    versionKey: false,
  },
);

syncChangeSchema.index({ revision: 1 });

export type SyncChangeDocument = InferSchemaType<typeof syncChangeSchema>;

export const SyncChangeModel = model<SyncChangeDocument>("SyncChange", syncChangeSchema);
