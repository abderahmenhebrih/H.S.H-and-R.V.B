import { Schema, model, type InferSchemaType } from "mongoose";

const rvbNotificationRecipientSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    notificationId: { type: String, required: true },
    accountId: { type: String, required: true },
    readAt: { type: Number, required: false, default: null },
    archivedAt: { type: Number, required: false, default: null },
    deliveredAt: { type: Number, required: false, default: null },
    suppressedAt: { type: Number, required: false, default: null },
    suppressionReason: { type: String, required: false, default: null },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
  },
  {
    collection: "rvb_notification_recipients",
    versionKey: false,
  },
);

rvbNotificationRecipientSchema.index({ notificationId: 1 });
rvbNotificationRecipientSchema.index({ accountId: 1 });
rvbNotificationRecipientSchema.index({ notificationId: 1, accountId: 1 }, { unique: true });
rvbNotificationRecipientSchema.index({ accountId: 1, readAt: 1 });
rvbNotificationRecipientSchema.index({ accountId: 1, archivedAt: 1 });
rvbNotificationRecipientSchema.index({ accountId: 1, createdAt: -1 });

export type RvbNotificationRecipientDocument = InferSchemaType<typeof rvbNotificationRecipientSchema>;
export const RvbNotificationRecipientModel = model<RvbNotificationRecipientDocument>(
  "RvbNotificationRecipient",
  rvbNotificationRecipientSchema,
);
