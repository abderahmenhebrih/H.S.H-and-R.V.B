import dns from "dns";
try {
  // SRV lookup for Atlas fails with default 127.0.0.1 on this host; use system DNS that resolves _mongodb._tcp
  dns.setServers(["192.168.100.1", "8.8.8.8", "1.1.1.1"]);
} catch {}
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

export async function connectDatabase(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined.");
  }

  if (mongoose.connection.readyState === 1) {
    return;
  }

  await mongoose.connect(mongoUri);

  console.log("MongoDB connected successfully.");
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
