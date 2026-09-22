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
import workerRequestsRouter from "./routes/worker-requests";
import workerFinancialEventsRouter from "./routes/worker-financial-events";
import workerActivitiesRouter from "./routes/worker-activities";
import supplierRequestsRouter from "./routes/supplier-requests";
import customerOrdersRouter from "./routes/customer-orders";
import customerRequestsRouter from "./routes/customer-requests";
import rvbRequestsRouter from "./routes/rvb-requests";
import chatsRouter from "./routes/chats";
import rvbNotificationsRouter from "./routes/rvb-notifications";
import rvbActivitiesRouter from "./routes/rvb-activities";
import rvbDirectoryRouter from "./routes/rvb-directory";
import { createServer } from "http";
import { initChatSocket } from "./lib/chat-socket";

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
app.use("/api/rvb/worker-requests", workerRequestsRouter);
app.use("/api/rvb/worker-financial-events", workerFinancialEventsRouter);
app.use("/api/rvb/worker-activities", workerActivitiesRouter);
app.use("/api/rvb/supplier-requests", supplierRequestsRouter);
app.use("/api/rvb/customer-orders", customerOrdersRouter);
app.use("/api/rvb/customer-requests", customerRequestsRouter);
app.use("/api/rvb/requests", rvbRequestsRouter);
app.use("/api/rvb/chats", chatsRouter);
app.use("/api/rvb/notifications", rvbNotificationsRouter);
app.use("/api/rvb/activities", rvbActivitiesRouter);
app.use("/api/rvb/directory", rvbDirectoryRouter);

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

  const httpServer = createServer(app);
  initChatSocket(httpServer, allowedOrigins);
  httpServer.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

startServer();
