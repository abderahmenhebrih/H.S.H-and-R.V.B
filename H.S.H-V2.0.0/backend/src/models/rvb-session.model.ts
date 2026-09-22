import { Schema, model, type InferSchemaType } from "mongoose";

const rvbSessionSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    accountId: { type: String, required: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    expiresAt: { type: Number, required: true },
    revokedAt: { type: Number, required: false, default: null },
    lastUsedAt: { type: Number, required: false, default: null },
    userAgent: { type: String, required: false },
    ipAddress: { type: String, required: false },
    rotationFamilyId: { type: String, required: false },
    clientType: { type: String, enum: ["web", "native"], required: false, default: "web" },
  },
  {
    collection: "rvb_sessions",
    versionKey: false,
  },
);

rvbSessionSchema.index({ expiresAt: 1 });

export type RvbSessionDocument = InferSchemaType<typeof rvbSessionSchema>;
export const RvbSessionModel = model<RvbSessionDocument>("RvbSession", rvbSessionSchema);
