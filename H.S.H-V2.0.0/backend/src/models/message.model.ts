import { Schema, model, type InferSchemaType } from "mongoose";

const editHistorySchema = new Schema(
  {
    content: { type: String, required: true },
    editedAt: { type: Number, required: true },
    editedBy: { type: String, required: false, default: null },
  },
  { _id: false }
);

const reactionSchema = new Schema(
  {
    accountId: { type: String, required: true },
    emoji: { type: String, required: true },
    createdAt: { type: Number, required: true },
  },
  { _id: false }
);

const readSchema = new Schema(
  {
    accountId: { type: String, required: true },
    readAt: { type: Number, required: true },
  },
  { _id: false }
);

const attachmentSchema = new Schema(
  {
    // Additive shared contract (mobile + desktop safe: optional, ignored by old clients).
    // Stored inline as data URL to reuse the existing JSON auth pipeline
    // (no separate upload endpoint / no secrets on device). Bounded in size
    // by the service validator below so documents stay well under Mongo limits.
    kind: { type: String, enum: ["image", "video"], required: true },
    dataUrl: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number, required: false, default: null },
    height: { type: Number, required: false, default: null },
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    conversationId: { type: String, required: true },
    senderAccountId: { type: String, required: true },
    // Text may be empty for attachment-only messages (additive contract).
    content: { type: String, required: false, default: "" },
    replyToMessageId: { type: String, required: false, default: null },
    editedAt: { type: Number, required: false, default: null },
    deletedAt: { type: Number, required: false, default: null },
    deletedBy: { type: String, required: false, default: null },
    isDeleted: { type: Boolean, required: true, default: false },
    editHistory: { type: [editHistorySchema], required: false, default: [] },
    reactions: { type: [reactionSchema], required: false, default: [] },
    readBy: { type: [readSchema], required: false, default: [] },
    // For mentions/tags snapshot (store raw content, parsed mentions via service)
    mentions: { type: [String], required: false, default: [] },
    reminderAt: { type: Number, required: false, default: null },
    attachments: { type: [attachmentSchema], required: false, default: [] },
  },
  { collection: "messages", versionKey: false }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ senderAccountId: 1 });
messageSchema.index({ replyToMessageId: 1 });

export type MessageDocument = InferSchemaType<typeof messageSchema>;
export const MessageModel = model<MessageDocument>("Message", messageSchema);
