import { Schema, model, type InferSchemaType } from "mongoose";

const workerSchema = new Schema(
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

    name: {
      type: String,
      required: true,
      unique: true,
    },

    phone: {
      type: String,
      required: true,
    },

    address: {
      type: String,
      required: false,
    },

    birthDate: {
      type: Number,
      required: false,
    },

    employmentDate: {
      type: Number,
      required: true,
    },

    position: {
      type: String,
      required: true,
    },

    notes: {
      type: String,
      required: false,
    },

    startingSalary: {
      type: Number,
      required: true,
    },

    monthlySalary: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "archived"],
      required: true,
    },

    balance: {
      type: Number,
      required: true,
    },
  },
  {
    collection: "workers",
    versionKey: false,
  },
);

export type WorkerDocument = InferSchemaType<typeof workerSchema>;

export const WorkerModel = model<WorkerDocument>(
  "Worker",
  workerSchema,
);

