import { Schema, model, type InferSchemaType } from "mongoose";

const linkedEntitySchema = new Schema(
  {
    entityType: {
      type: String,
      enum: ["customer", "supplier", "worker", "product", "sale", "purchase", "payment", "invoice", "vehicle", "task"],
      required: true,
    },
    entityId: { type: String, required: true },
    labelSnapshot: { type: String, required: true },
  },
  { _id: false }
);

const officeFileSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    syncStatus: { type: String, enum: ["synced", "pending", "failed"], required: true },
    lastSyncedAt: { type: Number, required: false },
    serverRevision: { type: Number, required: false },

    type: { type: String, enum: ["document", "spreadsheet"], required: true },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: false, maxlength: 2000 },
    content: { type: Schema.Types.Mixed, required: true },
    contentVersion: { type: Number, required: false, default: 1 },
    tags: { type: [String], required: false, default: [] },
    linkedEntities: { type: [linkedEntitySchema], required: false, default: [] },
    templateId: { type: String, required: false },
    isFavorite: { type: Boolean, required: false, default: false },
    isArchived: { type: Boolean, required: false, default: false },
    deletedAt: { type: Number, required: false },
    lastOpenedAt: { type: Number, required: false },
    createdBy: { type: String, required: false },
  },
  {
    collection: "officeFiles",
    versionKey: false,
  }
);

officeFileSchema.index({ type: 1, updatedAt: -1 });
officeFileSchema.index({ isArchived: 1 });
officeFileSchema.index({ isFavorite: 1 });

export type OfficeFileDocument = InferSchemaType<typeof officeFileSchema>;

export const OfficeFileModel = model<OfficeFileDocument>("OfficeFile", officeFileSchema);
