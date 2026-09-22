import { Schema, model, type InferSchemaType } from "mongoose";

const workerFinancialEventSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    workerId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["salary", "bonus", "absence", "payment", "loan", "adjustment"],
      required: true,
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    note: { type: String, required: false, default: null },
    actorId: { type: String, required: false, default: null },
    actorTag: { type: String, required: false, default: null },
    referenceId: { type: String, required: false, default: null },
  },
  {
    collection: "worker_financial_events",
    versionKey: false,
  },
);

workerFinancialEventSchema.index({ workerId: 1, createdAt: -1 });

export type WorkerFinancialEventDocument = InferSchemaType<typeof workerFinancialEventSchema>;

export const WorkerFinancialEventModel = model<WorkerFinancialEventDocument>(
  "WorkerFinancialEvent",
  workerFinancialEventSchema,
);
