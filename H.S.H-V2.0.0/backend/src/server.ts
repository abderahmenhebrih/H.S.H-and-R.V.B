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
import rvbWorkersRouter from "./routes/rvb-workers";
import rvbSuppliersRouter from "./routes/rvb-suppliers";
import rvbCustomersRouter from "./routes/rvb-customers";
import rvbPortalRouter from "./routes/rvb-portal";
import rvbCatalogRouter from "./routes/rvb-catalog";
import rvbConfigRouter from "./routes/rvb-config";
import { createServer } from "http";
import { initChatSocket } from "./lib/chat-socket";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const SERVER_MODE = (process.env.SERVER_MODE || "full").toLowerCase();
const TRUST_PROXY = process.env.TRUST_PROXY || "0";

if (TRUST_PROXY && TRUST_PROXY !== "0" && TRUST_PROXY !== "false") {
  const val: any = TRUST_PROXY === "1" || TRUST_PROXY === "true" ? 1 : TRUST_PROXY;
  (app as any).set("trust proxy", val);
}

if (process.env.NODE_ENV === "production" && SERVER_MODE === "full" && process.env.ALLOW_FULL_SERVER_IN_PRODUCTION !== "true") {
  // eslint-disable-next-line no-console
  console.warn(
    "[security] SERVER_MODE=full in production exposes /api/sync,/api/printing,/api/invoices. Set SERVER_MODE=rvb-public for public/mobile deployment or ALLOW_FULL_SERVER_IN_PRODUCTION=true to suppress.",
  );
}

app.disable("x-powered-by");
// Helmet-like minimal headers without extra dep
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
      .map((o) => o.trim())
      .filter(Boolean)
  : ["http://localhost:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without Origin (native apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-RVB-Client", "X-Refresh-Token", "X-Requested-With"],
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

import { rateLimit, ipKey } from "./middleware/rateLimiter";
// Unauthenticated: IP-based is correct
app.use("/api/rvb/auth/login", rateLimit({ windowMs: 60 * 1000, max: 20, key: ipKey, code: "RVB_RATE_LIMIT" }));
app.use("/api/rvb/auth/refresh", rateLimit({ windowMs: 60 * 1000, max: 60, key: ipKey }));
// Authenticated routes rate limiters are applied AFTER requireRvbAuth inside their routers
// to ensure req.rvbUser.accountId is available (per-account, with IP fallback)

// Mount H.S.H internal routes only in full mode
if (SERVER_MODE !== "rvb-public") {
  app.use("/api/sync", syncRouter);
  app.use("/api/printing", printingRouter);
  app.use("/api/invoices", invoiceRouter);
} else {
  app.use("/api/sync", (_req, res) => res.status(404).json({ success: false, code: "NOT_FOUND" }));
  app.use("/api/printing", (_req, res) => res.status(404).json({ success: false, code: "NOT_FOUND" }));
  app.use("/api/invoices", (_req, res) => res.status(404).json({ success: false, code: "NOT_FOUND" }));
}
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
app.use("/api/rvb/workers", rvbWorkersRouter);
app.use("/api/rvb/suppliers", rvbSuppliersRouter);
app.use("/api/rvb/customers", rvbCustomersRouter);
app.use("/api/rvb/portal", rvbPortalRouter);
app.use("/api/rvb/catalog", rvbCatalogRouter);
app.use("/api/rvb/config", rvbConfigRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Hebrih Slaughter House API is running",
  });
});

async function startServer() {
  try {
    await connectDatabase();
    // Safe index migration for conversation official private unique bug: ensure old index dropped and new created
    try {
      const { ensureConversationIndexes } = await import("./models/conversation.model");
      await ensureConversationIndexes();
    } catch (e) {
      console.warn("ensureConversationIndexes failed", (e as any)?.message);
    }
    // Notification channel separation migrations: index + legacy channel classification (safe, non-destructive)
    try {
      const { ensureNotificationIndexes, migrateLegacyNotificationChannels } = await import("./models/notification.model");
      await ensureNotificationIndexes();
      await migrateLegacyNotificationChannels();
    } catch (e) {
      console.warn("notification migration failed", (e as any)?.message);
    }
  } catch (error) {
    console.warn(
      "Database connection failed, continuing without DB (printing will use fallback):",
      error instanceof Error ? error.message : error,
    );
  }

  const httpServer = createServer(app);
  initChatSocket(httpServer, allowedOrigins);
  try {
    const { startRvbChatReminderProcessor } = await import("./services/rvb-chat-reminder.processor");
    startRvbChatReminderProcessor();
  } catch (e) {
    console.warn("reminder processor start failed", (e as any)?.message);
  }
  httpServer.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

startServer();
