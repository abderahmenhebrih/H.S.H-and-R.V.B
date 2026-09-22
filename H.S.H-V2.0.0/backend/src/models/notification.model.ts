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

    channel: {
      type: String,
      enum: ["hsh", "rvb"],
      required: true,
      default: "hsh",
    },
  },
  {
    collection: "notifications",
    versionKey: false,
  },
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ channel: 1, sourceEventId: 1 }, { unique: true, sparse: true });
notificationSchema.index({ channel: 1 });
notificationSchema.index({ serverRevision: 1 });
notificationSchema.index({ audienceType: 1, createdAt: -1 });
notificationSchema.index({ readAt: 1 });
notificationSchema.index({ archivedAt: 1 });
notificationSchema.index({ priority: 1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema>;

export const NotificationModel = model<NotificationDocument>("Notification", notificationSchema);

// Safe index migration for sourceEventId channel compound unique: drop legacy sourceEventId_1 unique if matches {sourceEventId:1}
export async function ensureNotificationIndexes(): Promise<void> {
  try {
    const coll: any = (NotificationModel as any).collection;
    if (!coll || typeof coll.listIndexes !== "function") return;
    let indexes: any[] = [];
    try {
      indexes = await coll.listIndexes().toArray();
    } catch {
      try {
        const db: any = (NotificationModel as any).db;
        if (db && db.db) {
          const res: any = await db.db.command({ listIndexes: "notifications" });
          indexes = res?.cursor?.firstBatch || [];
        }
      } catch {}
    }
    // Detect exact obsolete index: name sourceEventId_1 with key { sourceEventId: 1 } unique sparse
    const obsolete = indexes.find((idx: any) => idx.name === "sourceEventId_1");
    const isObsoleteMatch =
      obsolete &&
      obsolete.key &&
      Object.keys(obsolete.key).length === 1 &&
      (obsolete.key as any).sourceEventId === 1 &&
      obsolete.unique === true &&
      obsolete.sparse === true;
    if (isObsoleteMatch) {
      try {
        await coll.dropIndex("sourceEventId_1");
        // eslint-disable-next-line no-console
        console.log("[notification] dropped legacy index sourceEventId_1");
      } catch (e: any) {
        if (e?.codeName !== "IndexNotFound" && e?.code !== 27) {
          // eslint-disable-next-line no-console
          console.warn("[notification] drop legacy index failed:", e?.message);
        }
      }
      try {
        indexes = await coll.listIndexes().toArray();
      } catch {}
    }
    const names = new Set(indexes.map((i: any) => i.name));
    // Ensure compound unique index channel_1_sourceEventId_1
    if (!names.has("channel_1_sourceEventId_1")) {
      try {
        await coll.createIndex({ channel: 1, sourceEventId: 1 }, { unique: true, sparse: true, name: "channel_1_sourceEventId_1" });
        // eslint-disable-next-line no-console
        console.log("[notification] created index channel_1_sourceEventId_1");
      } catch (e: any) {
        if (!String(e?.message || "").includes("already exists")) {
          // eslint-disable-next-line no-console
          console.warn("[notification] create compound index failed:", e?.message);
        }
      }
    }
    // Ensure channel index
    if (!names.has("channel_1")) {
      try {
        await coll.createIndex({ channel: 1 }, { name: "channel_1" });
        // eslint-disable-next-line no-console
        console.log("[notification] created index channel_1");
      } catch {}
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[notification] ensureNotificationIndexes error", e?.message);
  }
}

// Legacy channel classifier: existing docs where channel missing or incorrectly hsh -> if RVB patterns then rvb else hsh
export async function migrateLegacyNotificationChannels(): Promise<void> {
  try {
    const coll: any = (NotificationModel as any).collection;
    if (!coll) return;
    // RVB patterns
    const rvbPrefixes = ["worker-request:", "supplier-request:", "customer-request:", "customer-order:", "chat:"];
    const prefixRegex = rvbPrefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    // Only classify where channel missing/null or hsh but matches RVB patterns
    // Safe non-destructive: only update docs matching RVB pattern to rvb, keep others as hsh
    // We also set channel=hsh for docs missing channel that are NOT RVB
    const bulk: any[] = [];
    // Find candidates that match RVB pattern and channel != rvb
    const candidates = await NotificationModel.find({
      $and: [
        { $or: [{ channel: { $exists: false } }, { channel: null }, { channel: "hsh" }] },
        {
          $or: [
            { route: { $regex: "^/rvb" } },
            { sourceEventId: { $regex: `^(${prefixRegex})` } },
          ],
        },
      ],
    } as any)
      .select({ id: 1, route: 1, sourceEventId: 1, channel: 1 })
      .lean();
    if (candidates.length) {
      const ops = candidates.map((doc: any) => ({
        updateOne: { filter: { id: doc.id }, update: { $set: { channel: "rvb" } } },
      }));
      // Chunk bulk writes
      for (let i = 0; i < ops.length; i += 500) {
        await NotificationModel.bulkWrite(ops.slice(i, i + 500) as any);
      }
      // eslint-disable-next-line no-console
      console.log(`[notification] migrateLegacyNotificationChannels: updated ${candidates.length} docs to channel=rvb`);
    }
    // For remaining docs where channel missing and NOT RVB, set to hsh
    const missingNotRvb = await NotificationModel.find({
      $or: [{ channel: { $exists: false } }, { channel: null }],
      $nor: [
        { route: { $regex: "^/rvb" } },
        { sourceEventId: { $regex: `^(${prefixRegex})` } },
      ],
    } as any)
      .select({ id: 1 })
      .lean();
    if (missingNotRvb.length) {
      const ops2 = missingNotRvb.map((doc: any) => ({
        updateOne: { filter: { id: doc.id }, update: { $set: { channel: "hsh" } } },
      }));
      for (let i = 0; i < ops2.length; i += 500) {
        await NotificationModel.bulkWrite(ops2.slice(i, i + 500) as any);
      }
      // eslint-disable-next-line no-console
      console.log(`[notification] migrateLegacyNotificationChannels: updated ${missingNotRvb.length} missing docs to channel=hsh`);
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[notification] migrateLegacyNotificationChannels error", e?.message);
  }
}
