import dotenv from "dotenv";
import mongoose from "mongoose";
import { configureDatabaseDns } from "../src/config/dns";

dotenv.config();
configureDatabaseDns();

function sanitizedHost(uri: string): string {
  try {
    return new URL(uri).hostname;
  } catch {
    return "(unparseable)";
  }
}

// Deletion order: children/dependents before parents. settings is PRESERVED
// (global startup-required singleton). Indexes are never touched by
// deleteMany, so unique constraints (incl. the customer-order idempotency
// index) survive by construction.
const DELETE_ORDER = [
  // Auth sessions first (nothing references them, but they gate nothing either).
  "rvb_sessions",
  // Notification delivery state + notifications.
  "rvb_notification_recipients",
  "notifications",
  // Chat: audits/uploads/messages/reminders before conversations.
  "message_audits",
  "chat_uploads",
  "messages",
  "rvb_chat_reminders",
  "conversations",
  // Activity/audit trails.
  "rvb_activities",
  // Entity-linked financial/activity rows.
  "worker_requests",
  "worker_financial_events",
  "worker_activities",
  "supplier_requests",
  "customer_requests",
  "customer_orders",
  // Business documents.
  "sales",
  "purchases",
  "payments",
  "transfers",
  "expenses",
  "incomingInvoices",
  "invoices",
  "invoiceSellerProfiles",
  "invoiceSourceReservations",
  "invoiceTaxProfiles",
  "products",
  "officeFiles",
  "bankAccounts",
  "tasks",
  "vehicles",
  "injuryEquations",
  // HSH sync operational history (counter self-heals via upsert on demand).
  "processedSyncOperations",
  "syncChanges",
  "syncCounters",
  // People, then identities last.
  "workers",
  "suppliers",
  "customers",
  "rvb_accounts",
];

async function main() {
  if (process.env.CONFIRM_FULL_DATA_RESET !== "YES") {
    console.error("ABORT: set CONFIRM_FULL_DATA_RESET=YES to run this destructive reset. Nothing was modified.");
    process.exit(2);
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI missing");
    process.exit(2);
  }
  console.log("TARGET DATABASE: (see below after connect)");
  console.log("TARGET MONGODB HOST:", sanitizedHost(uri));
  console.log("NODE_ENV:", process.env.NODE_ENV || "(unset)");

  await mongoose.connect(uri);
  const db = mongoose.connection.db as any;
  console.log("TARGET DATABASE:", db.databaseName);

  const before: Record<string, number> = {};
  for (const name of DELETE_ORDER) {
    try {
      before[name] = await db.collection(name).estimatedDocumentCount();
    } catch {
      before[name] = -1;
    }
  }
  console.log("\nBEFORE:", JSON.stringify(before));

  // --- Cloudinary chat media (app namespace only, via trusted records) ---
  let cloudFound = 0;
  let cloudDeleted = 0;
  const cloudSkipped: string[] = [];
  try {
    const uploads: any[] = await db.collection("chat_uploads").find({}).toArray();
    cloudFound = uploads.length;
    const hasCreds = !!process.env.CLOUDINARY_CLOUD_NAME && !!process.env.CLOUDINARY_API_KEY && !!process.env.CLOUDINARY_API_SECRET;
    if (!hasCreds) {
      console.log(`Cloudinary: NO credentials in this environment — ${cloudFound} blob(s) CANNOT be deleted from here. DB rows will still be cleared; remove residual CDN blobs where credentials exist.`);
      for (const u of uploads) cloudSkipped.push(String(u.publicId));
    } else {
      const { deleteChatMediaBlob } = await import("../src/services/chat-media-storage.service");
      for (const u of uploads) {
        try {
          await deleteChatMediaBlob(String(u.publicId), String(u.provider));
          cloudDeleted++;
        } catch (e: any) {
          console.warn(`Cloudinary delete failed for ${u.publicId}: ${e?.message}`);
          cloudSkipped.push(String(u.publicId));
        }
      }
    }
  } catch (e: any) {
    console.warn("Cloudinary step failed:", e?.message);
  }
  console.log(`Cloudinary chat assets found: ${cloudFound}, deleted: ${cloudDeleted}, skipped: ${cloudSkipped.length}`);

  // --- Application data wipe (collections + indexes preserved) ---
  const deleted: Record<string, number> = {};
  for (const name of DELETE_ORDER) {
    try {
      const r = await db.collection(name).deleteMany({});
      deleted[name] = r.deletedCount ?? 0;
    } catch (e: any) {
      console.warn(`deleteMany failed for ${name}: ${e?.message}`);
      deleted[name] = -1;
    }
  }
  const total = Object.values(deleted).reduce((a: number, b: number) => a + Math.max(0, b), 0);
  console.log(`\nApplication records deleted (total): ${total}`);

  // --- Verify empty ---
  const after: Record<string, number> = {};
  for (const name of DELETE_ORDER) {
    try {
      after[name] = await db.collection(name).estimatedDocumentCount();
    } catch {
      after[name] = -1;
    }
  }
  console.log("AFTER:", JSON.stringify(after));
  const remaining = Object.entries(after).filter(([, n]) => n !== 0);
  if (remaining.length) console.warn("NON-EMPTY collections:", JSON.stringify(remaining));

  // --- Verify critical indexes survived ---
  try {
    const idx: any[] = await db.collection("customer_orders").listIndexes().toArray();
    const idem = idx.find((i: any) => i.name === "customer_order_account_idempotency_unique");
    console.log("\nIdempotency index present:", !!idem);
    if (idem) console.log("Idempotency index spec:", JSON.stringify({ key: idem.key, unique: idem.unique, partialFilterExpression: idem.partialFilterExpression }));
    else console.warn("IDEMPOTENCY INDEX MISSING — STOP, do not proceed with production use");
    console.log("customer_orders indexes:", JSON.stringify(idx.map((i: any) => i.name)));
  } catch (e: any) {
    console.warn("index check failed:", e?.message);
  }
  try {
    const accIdx: any[] = await db.collection("rvb_accounts").listIndexes().toArray();
    console.log("rvb_accounts indexes:", JSON.stringify(accIdx.map((i: any) => i.name)));
    const convIdx: any[] = await db.collection("conversations").listIndexes().toArray();
    console.log("conversations indexes:", JSON.stringify(convIdx.map((i: any) => i.name)));
  } catch (e: any) {
    console.warn("index check failed:", e?.message);
  }

  // settings preserved by design (startup-required singleton)
  try {
    const n = await db.collection("settings").estimatedDocumentCount();
    console.log(`\nsettings docs preserved: ${n}`);
  } catch {}

  await mongoose.disconnect();
  console.log("\nRESET DONE. Database NOT dropped. Collections NOT dropped. Indexes NOT dropped.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
