import { Schema, model, type InferSchemaType } from "mongoose";

const messageAuditSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    messageId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    action: { type: String, enum: ["create", "edit", "delete"], required: true },
    actorAccountId: { type: String, required: true },
    contentSnapshot: { type: String, required: false, default: null },
    previousContent: { type: String, required: false, default: null },
    newContent: { type: String, required: false, default: null },
    metadata: { type: Schema.Types.Mixed, required: false, default: null },
  },
  { collection: "message_audits", versionKey: false }
);

messageAuditSchema.index({ messageId: 1, createdAt: -1 });
messageAuditSchema.index({ conversationId: 1, createdAt: -1 });

export type MessageAuditDocument = InferSchemaType<typeof messageAuditSchema>;
export const MessageAuditModel = model<MessageAuditDocument>("MessageAudit", messageAuditSchema);
