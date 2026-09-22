import { Schema, model, type InferSchemaType } from "mongoose";

const workerRequestSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    workerId: { type: String, required: true, index: true },
    accountId: { type: String, required: false, default: null },
    type: {
      type: String,
      enum: ["payment", "loan", "discrepancy"],
      required: true,
    },
    status: {
      type: String,
      enum: ["under_review", "accepted", "rejected"],
      required: true,
      default: "under_review",
    },
    amount: { type: Number, required: false, default: null },
    description: { type: String, required: false, default: null },
    submittedAt: { type: Number, required: true },
    reviewedAt: { type: Number, required: false, default: null },
    reviewedBy: { type: String, required: false, default: null },
    notes: { type: String, required: false, default: null },
    paymentId: { type: String, required: false, default: null },
    // For idempotency of loan financial event
    financialEventId: { type: String, required: false, default: null },
  },
  {
    collection: "worker_requests",
    versionKey: false,
  },
);

workerRequestSchema.index({ workerId: 1, createdAt: -1 });
workerRequestSchema.index({ status: 1 });

export type WorkerRequestDocument = InferSchemaType<typeof workerRequestSchema>;

export const WorkerRequestModel = model<WorkerRequestDocument>("WorkerRequest", workerRequestSchema);
