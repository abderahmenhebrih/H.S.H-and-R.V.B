import { Schema, model, type InferSchemaType } from "mongoose";

const workerActivitySchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    workerId: { type: String, required: true, index: true },
    accountId: { type: String, required: false, default: null },
    action: { type: String, required: true },
    details: { type: String, required: false, default: null },
    actorId: { type: String, required: false, default: null },
    actorTag: { type: String, required: false, default: null },
  },
  {
    collection: "worker_activities",
    versionKey: false,
  },
);

workerActivitySchema.index({ workerId: 1, createdAt: -1 });

export type WorkerActivityDocument = InferSchemaType<typeof workerActivitySchema>;

export const WorkerActivityModel = model<WorkerActivityDocument>("WorkerActivity", workerActivitySchema);
