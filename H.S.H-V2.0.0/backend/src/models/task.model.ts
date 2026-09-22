import { Schema, model, type InferSchemaType } from "mongoose";

const taskSchema = new Schema(
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
    },

    deadline: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "completed"],
      required: false,
      default: "pending",
    },

    completedAt: {
      type: Number,
      required: false,
    },
  },
  {
    collection: "tasks",
    versionKey: false,
  },
);

export type TaskDocument = InferSchemaType<typeof taskSchema>;

export const TaskModel = model<TaskDocument>(
  "Task",
  taskSchema,
);

