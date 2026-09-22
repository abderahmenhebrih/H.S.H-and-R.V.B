import dns from "dns";
try {
  dns.setServers(["192.168.100.1", "8.8.8.8", "1.1.1.1"]);
} catch {}
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import cookieParser from "cookie-parser";
import { connectDatabase } from "./config/database";
import syncRouter from "./routes/sync";
import printingRouter from "./routes/printing";
import invoiceRouter from "./routes/invoice";
import rvbAccountsRouter from "./routes/rvb-accounts";
import rvbAuthRouter from "./routes/rvb-auth";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (no origin) and configured origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/api/sync", syncRouter);
app.use("/api/printing", printingRouter);
app.use("/api/invoices", invoiceRouter);
app.use("/api/rvb/accounts", rvbAccountsRouter);
app.use("/api/rvb/auth", rvbAuthRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Hebrih Slaughter House API is running",
  });
});

async function startServer() {
  try {
    await connectDatabase();
  } catch (error) {
    console.warn(
      "Database connection failed, continuing without DB (printing will use fallback):",
      error instanceof Error ? error.message : error,
    );
  }

  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

startServer();
