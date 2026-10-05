import path from "node:path";
import dns from "node:dns";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { configureDatabaseDns } from "../src/config/dns";
import { normalizeTag, isValidTag } from "../src/constants/rvb-account";

dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error("Usage: npm run rvb:check-account -- <tag>");
  const tag = normalizeTag(args[0] || "abattoire");
  if (!isValidTag(tag)) throw new Error("The requested tag is invalid.");

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured.");
  configureDatabaseDns();

  // Use the native driver, without importing Mongoose models: this check does
  // not create collections/indexes, attempt passwords, or change account state.
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const database = client.db();
    const accounts = database.collection("rvb_accounts");
    const [totalAccounts, managementAccounts, legacyAdminAccounts, account] = await Promise.all([
      accounts.countDocuments({}),
      accounts.countDocuments({ role: { $in: ["manager", "supervisor"] } }),
      accounts.countDocuments({ role: "admin" }),
      accounts.findOne({ tag }, { projection: {
        _id: 0, id: 1, tag: 1, role: 1, status: 1, passwordHash: 1,
        mustChangePassword: 1, lockedUntil: 1,
      } }),
    ]);

    console.log(JSON.stringify({
      database: database.databaseName,
      dnsServers: dns.getServers(),
      accessSecretConfigured: Boolean(process.env.RVB_JWT_ACCESS_SECRET),
      refreshSecretConfigured: Boolean(process.env.RVB_JWT_REFRESH_SECRET),
      totalAccounts,
      managementAccounts,
      legacyAdminAccounts,
      requestedTag: tag,
      found: Boolean(account),
      account: account ? {
        id: account.id, tag: account.tag, role: account.role, status: account.status,
        hasPassword: Boolean(account.passwordHash),
        mustChangePassword: Boolean(account.mustChangePassword),
        lockedUntil: account.lockedUntil || null,
      } : null,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  const failure = error as { name?: string; code?: string | number };
  // Driver messages may contain hostnames or credentials. Keep output bounded.
  console.error("Account check failed:", failure.name || "Error", failure.code || "");
  console.error("Check the configured database, DNS, and required environment variables locally.");
  process.exitCode = 1;
});
