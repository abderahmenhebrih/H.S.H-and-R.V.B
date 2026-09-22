import { Schema, model, type InferSchemaType } from "mongoose";

const rvbActivitySchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true, index: true },
    actorAccountId: { type: String, required: false, default: null, index: true },
    actorTag: { type: String, required: false, default: null },
    actorRole: { type: String, required: false, default: null },
    entityType: { type: String, required: false, default: null, index: true },
    entityId: { type: String, required: false, default: null, index: true },
    action: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ["accounts", "workers", "suppliers", "customers", "requests", "orders", "chats", "system"],
      required: false,
      index: true,
      default: "system",
    },
    sourceId: { type: String, required: false, default: null },
    title: { type: String, required: false, default: null },
    details: { type: String, required: false, default: null },
  },
  {
    collection: "rvb_activities",
    versionKey: false,
  },
);

rvbActivitySchema.index({ createdAt: -1 });
rvbActivitySchema.index({ actorAccountId: 1, createdAt: -1 });
rvbActivitySchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
rvbActivitySchema.index({ sourceType: 1, createdAt: -1 });

export type RvbActivityDocument = InferSchemaType<typeof rvbActivitySchema>;

export const RvbActivityModel = model<RvbActivityDocument>("RvbActivity", rvbActivitySchema);
