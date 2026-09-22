import { Schema, model, type InferSchemaType } from "mongoose";

const pinnedSchema = new Schema(
  {
    messageId: { type: String, required: true },
    pinnedBy: { type: String, required: true },
    pinnedAt: { type: Number, required: true },
  },
  { _id: false }
);

const participantSchema = new Schema(
  {
    accountId: { type: String, required: true },
    role: { type: String, required: true },
    joinedAt: { type: Number, required: true },
    leftAt: { type: Number, required: false, default: null },
  },
  { _id: false }
);

const conversationSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    category: { type: String, enum: ["main", "secondary"], required: true },
    type: {
      type: String,
      enum: ["official_group", "official_private", "dm", "group"],
      required: true,
    },
    officialKind: {
      type: String,
      enum: [
        "workers_group",
        "suppliers_group",
        "customers_group",
        "admin_worker",
        "admin_supplier",
        "admin_customer",
      ],
      required: false,
      default: null,
    },
    name: { type: String, required: false, default: null },
    avatar: { type: String, required: false, default: null },
    createdBy: { type: String, required: false, default: null },
    participants: { type: [participantSchema], required: true, default: [] },
    // For DM uniqueness: sorted key of two accountIds, or for group also participants? For main private deterministic id too.
    dmKey: { type: String, required: false, default: null },
    // For official private: linked entity/account identifiers for stable lookup
    linkedEntityType: { type: String, required: false, default: null },
    linkedEntityId: { type: String, required: false, default: null },
    linkedAccountId: { type: String, required: false, default: null },
    adminAccountId: { type: String, required: false, default: null },
    isSystemManaged: { type: Boolean, required: true, default: false },
    lastMessageAt: { type: Number, required: false, default: null },
    lastMessagePreview: { type: String, required: false, default: null },
    lastMessageSenderId: { type: String, required: false, default: null },
    pinnedMessages: { type: [pinnedSchema], required: false, default: [] },
    isArchived: { type: Boolean, required: false, default: false },
  },
  { collection: "conversations", versionKey: false }
);

conversationSchema.index({ category: 1, type: 1 });
conversationSchema.index({ "participants.accountId": 1 });
conversationSchema.index({ dmKey: 1 }, { unique: true, sparse: true, partialFilterExpression: { dmKey: { $type: "string" } } });
conversationSchema.index(
  { officialKind: 1, linkedEntityId: 1 },
  { unique: true, partialFilterExpression: { officialKind: { $type: "string" }, linkedEntityId: { $type: "string" } } }
);
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ updatedAt: -1 });

export type ConversationDocument = InferSchemaType<typeof conversationSchema>;
export const ConversationModel = model<ConversationDocument>("Conversation", conversationSchema);
