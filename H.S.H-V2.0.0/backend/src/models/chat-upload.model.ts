import { Schema, model, type InferSchemaType } from "mongoose";

// Trusted upload records for chat media (production URL-based architecture).
//
// Flow: client uploads bytes via POST /api/rvb/chats/:id/attachments (multipart,
// authenticated, membership-checked) -> backend stores bytes in object storage
// and creates a ChatUpload row (status "pending") -> client sends the message
// with { attachmentIds: [...] } -> sendMessage resolves each id to the STORED
// metadata (never trusting client-supplied URLs) and embeds it in the Message.
//
// Records are tiny (metadata only). "pending" rows older than their expiresAt
// are orphan candidates for cleanup; "attached" rows are kept as the
// ownership/audit trail for the referenced message attachments.
const chatUploadSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    expiresAt: { type: Number, required: true },
    conversationId: { type: String, required: true },
    uploaderAccountId: { type: String, required: true },
    kind: { type: String, enum: ["image", "video"], required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number, required: false, default: null },
    height: { type: Number, required: false, default: null },
    duration: { type: Number, required: false, default: null },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    provider: { type: String, required: true },
    status: { type: String, enum: ["pending", "attached"], required: true, default: "pending" },
  },
  { collection: "chat_uploads", versionKey: false },
);

chatUploadSchema.index({ conversationId: 1 });
chatUploadSchema.index({ expiresAt: 1 });
chatUploadSchema.index({ status: 1, expiresAt: 1 });

export type ChatUploadDocument = InferSchemaType<typeof chatUploadSchema>;
export const ChatUploadModel = model<ChatUploadDocument>("ChatUpload", chatUploadSchema);
