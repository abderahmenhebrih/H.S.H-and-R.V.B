import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

async function startQaMemory() {
  console.log("[QA] Starting MongoMemoryReplSet for isolated QA...");
  // QA-only: first start on Windows can take >10s (binary extraction / AV
  // scan). The library default launchTimeout (10s) aborts Playwright runs;
  // allow up to 120s for the isolated instance to come up. Production is
  // unaffected (it never runs this file; MONGODB_URI is used directly).
  const mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ launchTimeout: 120000 }],
  } as any);
  await mongod.waitUntilRunning();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  // Ensure we don't use production DB - log a snippet
  console.log("[QA] MONGODB_URI set to memory:", uri.slice(0, 30) + "...");
  // Also set a QA flag to avoid accidental production connection
  process.env.QA_ISOLATED = "true";
  // Now import and start the actual server (it will call connectDatabase using the new URI)
  // Clear any prior mongoose connection if exists
  if (mongoose.connection.readyState !== 0) {
    try { await mongoose.disconnect(); } catch {}
  }
  // Import server - this will call startServer() which connects to DB
  await import("./server.js");
  console.log("[QA] Backend QA server started with isolated DB");

  // Graceful shutdown on SIGINT/SIGTERM
  const cleanup = async () => {
    console.log("[QA] Shutting down memory server...");
    try { await mongoose.disconnect(); } catch {}
    try { await mongod.stop(); } catch {}
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

startQaMemory().catch((e) => {
  console.error("[QA] Failed to start memory server", e);
  process.exit(1);
});
