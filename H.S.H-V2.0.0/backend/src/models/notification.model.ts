import { Schema, model, type InferSchemaType } from "mongoose";

const notificationSchema = new Schema(
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

    type: {
      type: String,
      enum: [
        "customer_order",
        "task",
        "payment",
        "purchase",
        "sale",
        "expense",
        "transfer",
        "worker",
        "vehicle",
        "inventory",
        "account",
        "sync",
        "system",
      ],
      required: true,
    },

    severity: {
      type: String,
      enum: ["info", "success", "warning", "critical"],
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    entityType: {
      type: String,
      required: false,
    },

    entityId: {
      type: String,
      required: false,
    },

    route: {
      type: String,
      required: false,
    },

    sourceEventId: {
      type: String,
      required: false,
    },

    audienceType: {
      type: String,
      enum: ["all", "role", "user"],
      required: false,
    },

    audienceIds: {
      type: [String],
      required: false,
    },

    readAt: {
      type: Number,
      required: false,
      index: true,
    },
  },
  {
    collection: "notifications",
    versionKey: false,
  },
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ readAt: 1 });
notificationSchema.index({ sourceEventId: 1 }, { unique: true, sparse: true });
notificationSchema.index({ serverRevision: 1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema>;

export const NotificationModel = model<NotificationDocument>("Notification", notificationSchema);
