import dotenv from "dotenv";
import { connectDatabase, disconnectDatabase } from "../src/config/database";
import { RvbAccountModel } from "../src/models/rvb-account.model";

dotenv.config();

/**
 * RVB role consolidation: migrate legacy `admin` accounts to `manager`.
 *
 * In-place update of the `role` field ONLY. Preserved untouched:
 * id, tag, password hash, sessions, preferences, linked entity, createdAt,
 * profile picture, notification state, audit history.
 * Historical audit/actorRole snapshots are never rewritten.
 */
async function main() {
  await connectDatabase();
  try {
    const adminBefore = await RvbAccountModel.countDocuments({ role: "admin" });
    const managerBefore = await RvbAccountModel.countDocuments({ role: "manager" });
    console.log(`Admin accounts before: ${adminBefore}`);
    console.log(`Manager accounts before: ${managerBefore}`);

    if (adminBefore === 0) {
      console.log("No admin accounts to migrate.");
    } else {
      const now = Date.now();
      const res: any = await RvbAccountModel.updateMany(
        { role: "admin" },
        { $set: { role: "manager", updatedAt: now } },
      );
      console.log(`Migrated admin -> manager: ${res?.modifiedCount ?? res?.nModified ?? adminBefore}`);
    }

    const adminAfter = await RvbAccountModel.countDocuments({ role: "admin" });
    const managerAfter = await RvbAccountModel.countDocuments({ role: "manager" });
    console.log(`Admin accounts after: ${adminAfter}`);
    console.log(`Manager accounts after: ${managerAfter}`);

    if (adminAfter !== 0) {
      console.error("Migration incomplete: admin accounts remain.");
      process.exit(1);
    }
    console.log("Session note: auth resolves the active role from the DB on every request, so migrated accounts keep working with existing sessions as manager.");
  } finally {
    await disconnectDatabase().catch(() => {});
  }
}

main().catch((e) => {
  console.error("Admin migration failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
