import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let server: MongoMemoryServer | undefined;
let ownsConnection = false;
let originalUri: string | undefined;

// Tests must never try the application's MONGODB_URI, even when it is valid.
// If the temporary server cannot start, fail instead of falling back to Atlas.
export async function startIsolatedDatabase(): Promise<void> {
  if (server || mongoose.connection.readyState !== 0) {
    throw new Error("Refusing to run tests with an existing database connection.");
  }

  originalUri = process.env.MONGODB_URI;
  const databaseName = "rvb_test_" + randomUUID().replace(/-/g, "");
  server = await MongoMemoryServer.create({
    instance: {
      ip: "127.0.0.1", dbName: databaseName,
      args: process.platform === "win32" ? [] : ["--nounixsocket"],
    },
  });

  try {
    const uri = server.getUri(databaseName);
    if (new URL(uri).hostname !== "127.0.0.1") {
      throw new Error("Test database must be the newly created loopback server.");
    }
    process.env.MONGODB_URI = uri;
    ownsConnection = true;
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    console.log("Using a disposable local RVB test database; application URI ignored.");
  } catch (error) {
    await stopIsolatedDatabase();
    throw error;
  }
}

export async function stopIsolatedDatabase(): Promise<void> {
  if (!server) return;
  const ownedServer = server;
  try {
    if (ownsConnection) await mongoose.disconnect();
  } finally {
    ownsConnection = false;
    server = undefined;
    if (originalUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalUri;
    await ownedServer.stop();
  }
}
