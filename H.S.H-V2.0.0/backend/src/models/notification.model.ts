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
      default: null,
    },

    archivedAt: {
      type: Number,
      required: false,
      default: null,
    },

    priority: {
      type: String,
      enum: ["normal", "high", "urgent"],
      required: false,
      default: "normal",
    },

    mandatory: {
      type: Boolean,
      required: false,
      default: false,
    },

    category: {
      type: String,
      enum: ["chats", "mentions", "requests", "orders", "statusUpdates", "reminders", "system"],
      required: false,
      default: null,
    },
  },
  {
    collection: "notifications",
    versionKey: false,
  },
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ sourceEventId: 1 }, { unique: true, sparse: true });
notificationSchema.index({ serverRevision: 1 });
notificationSchema.index({ audienceType: 1, createdAt: -1 });
notificationSchema.index({ readAt: 1 });
notificationSchema.index({ archivedAt: 1 });
notificationSchema.index({ priority: 1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema>;

export const NotificationModel = model<NotificationDocument>("Notification", notificationSchema);
