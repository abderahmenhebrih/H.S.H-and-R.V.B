import { Schema, model, type InferSchemaType } from "mongoose";

const rvbChatReminderSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    messageId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    recipientAccountId: { type: String, required: true, index: true },
    createdByAccountId: { type: String, required: true },
    dueAt: { type: Number, required: true, index: true },
    sentAt: { type: Number, required: false, default: null, index: true },
    createdAt: { type: Number, required: true },
  },
  {
    collection: "rvb_chat_reminders",
    versionKey: false,
  },
);

rvbChatReminderSchema.index({ messageId: 1, recipientAccountId: 1 }, { unique: true });
rvbChatReminderSchema.index({ dueAt: 1, sentAt: 1 });

export type RvbChatReminderDocument = InferSchemaType<typeof rvbChatReminderSchema>;
export const RvbChatReminderModel = model<RvbChatReminderDocument>("RvbChatReminder", rvbChatReminderSchema);
