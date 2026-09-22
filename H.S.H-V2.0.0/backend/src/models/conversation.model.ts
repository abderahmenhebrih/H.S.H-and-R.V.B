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
conversationSchema.index({ dmKey: 1 }, { unique: true, partialFilterExpression: { dmKey: { $type: "string" } } });
// Official group: unique per kind (kept as is for official_group). Filtered to type official_group so private chats not affected.
conversationSchema.index(
  { officialKind: 1 },
  { unique: true, partialFilterExpression: { type: "official_group", officialKind: { $type: "string" } } }
);
// Official private: unique per admin per entity (fix bug where second Admin was blocked). Only for official_private.
conversationSchema.index(
  { officialKind: 1, linkedEntityId: 1, adminAccountId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "official_private",
      officialKind: { $type: "string" },
      linkedEntityId: { $type: "string" },
      adminAccountId: { $type: "string" },
    },
  }
);
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ updatedAt: -1 });

export type ConversationDocument = InferSchemaType<typeof conversationSchema>;
export const ConversationModel = model<ConversationDocument>("Conversation", conversationSchema);

// Safe index migration: drop legacy index officialKind_1_linkedEntityId_1 if it exists, create new private index.
// Do NOT use dropIndexes(). Uses listIndexes to verify existence before dropping.
export async function ensureConversationIndexes(): Promise<void> {
  try {
    const coll: any = (ConversationModel as any).collection;
    if (!coll || typeof coll.listIndexes !== "function") return;
    let indexes: any[] = [];
    try {
      indexes = await coll.listIndexes().toArray();
    } catch {
      // fallback via command
      try {
        const db: any = (ConversationModel as any).db;
        if (db && db.db) {
          const res: any = await db.db.command({ listIndexes: "conversations" });
          indexes = res?.cursor?.firstBatch || [];
        }
      } catch {}
    }
    const hasOld = indexes.some((idx: any) => idx.name === "officialKind_1_linkedEntityId_1");
    if (hasOld) {
      try {
        await coll.dropIndex("officialKind_1_linkedEntityId_1");
        // eslint-disable-next-line no-console
        console.log("[conversation] dropped legacy index officialKind_1_linkedEntityId_1");
      } catch (e: any) {
        if (e?.codeName !== "IndexNotFound" && e?.code !== 27) {
          // eslint-disable-next-line no-console
          console.warn("[conversation] drop legacy index failed:", e?.message);
        }
      }
      // Refresh index list after drop
      try {
        indexes = await coll.listIndexes().toArray();
      } catch {}
    }
    const names = new Set(indexes.map((i: any) => i.name));
    // Ensure private index exists
    if (!names.has("officialKind_1_linkedEntityId_1_adminAccountId_1")) {
      try {
        await coll.createIndex(
          { officialKind: 1, linkedEntityId: 1, adminAccountId: 1 },
          {
            unique: true,
            partialFilterExpression: {
              type: "official_private",
              officialKind: { $type: "string" },
              linkedEntityId: { $type: "string" },
              adminAccountId: { $type: "string" },
            },
            name: "officialKind_1_linkedEntityId_1_adminAccountId_1",
          }
        );
        // eslint-disable-next-line no-console
        console.log("[conversation] created index officialKind_1_linkedEntityId_1_adminAccountId_1");
      } catch (e: any) {
        if (!String(e?.message || "").includes("already exists")) {
          // eslint-disable-next-line no-console
          console.warn("[conversation] create private index failed:", e?.message);
        }
      }
    }
    // Ensure group index exists (officialKind_1 with filter type official_group)
    const hasGroup = indexes.some((i: any) => i.name === "officialKind_1");
    if (!hasGroup) {
      try {
        await coll.createIndex(
          { officialKind: 1 },
          {
            unique: true,
            partialFilterExpression: { type: "official_group", officialKind: { $type: "string" } },
            name: "officialKind_1",
          }
        );
      } catch {}
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[conversation] ensureConversationIndexes error", e?.message);
  }
}
