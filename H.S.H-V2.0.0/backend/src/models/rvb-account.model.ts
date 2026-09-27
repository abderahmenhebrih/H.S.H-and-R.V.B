import { Schema, model, type InferSchemaType } from "mongoose";

const rvbAccountSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    syncStatus: { type: String, enum: ["synced", "pending", "failed"], required: false, default: "synced" },
    lastSyncedAt: { type: Number, required: false },
    serverRevision: { type: Number, required: false },

    tag: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    role: {
      type: String,
      enum: ["manager", "admin", "supervisor", "worker", "supplier", "customer"],
      required: true,
    },
    linkedEntityType: {
      type: String,
      enum: ["worker", "supplier", "customer"],
      required: false,
      default: null,
    },
    linkedEntityId: { type: String, required: false, default: null },
    linkedEntityLifecyclePriorStatus: { type: String, enum: ["active", "archived", "disabled"], required: false, default: null },
    status: {
      type: String,
      enum: ["active", "archived", "disabled"],
      required: true,
      default: "active",
    },
    onboardingStatus: {
      type: String,
      enum: ["pending", "complete"],
      required: true,
      default: "pending",
    },
    profilePicture: { type: String, required: false },
    preferences: {
      type: Object,
      required: false,
      default: null,
    },
    archivedAt: { type: Number, required: false, default: null },
    lastLoginAt: { type: Number, required: false, default: null },
    passwordHash: { type: String, required: false, default: null },
    mustChangePassword: { type: Boolean, required: false, default: false },
    passwordChangedAt: { type: Number, required: false, default: null },
    failedLoginAttempts: { type: Number, required: false, default: 0 },
    lockedUntil: { type: Number, required: false, default: null },
  },
  {
    collection: "rvb_accounts",
    versionKey: false,
  },
);

rvbAccountSchema.index({ status: 1 });
rvbAccountSchema.index({ role: 1 });
rvbAccountSchema.index(
  { linkedEntityType: 1, linkedEntityId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      linkedEntityType: { $type: "string" },
      linkedEntityId: { $type: "string" },
    },
  },
);

export type RvbAccountDocument = InferSchemaType<typeof rvbAccountSchema>;

export const RvbAccountModel = model<RvbAccountDocument>("RvbAccount", rvbAccountSchema);
