import { Router } from "express";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { SettingsModel } from "../models/settings.model";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import { allocateRevision } from "../sync/rvb-sync-helper";
import { RvbActivityModel } from "../models/rvb-activity.model";

const router = Router();

router.use(requireRvbAuth as any);

const DEFAULT_CURRENCY = "DA";
const ALLOWED_CURRENCIES = ["DA", "€", "$"] as const;

// GET /api/rvb/config -> { currency } readable by all authenticated
router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    let settings: any = await SettingsModel.findOne({ id: "settings" }).lean();
    if (!settings) settings = await SettingsModel.findOne({}).lean();
    const currency = settings?.currency && ALLOWED_CURRENCIES.includes(settings.currency) ? settings.currency : DEFAULT_CURRENCY;
    const language = settings?.language || "ar";
    // Return minimal config; front may need more, include language
    res.json({
      success: true,
      config: {
        currency,
        language,
        // expose read-only other settings if needed but filtered
        customerTypes: settings?.customerTypes || [],
        workerPositions: settings?.workerPositions || [],
      },
      currency,
      settings: settings
        ? {
            id: settings.id,
            language: settings.language,
            currency: settings.currency,
            customerTypes: settings.customerTypes,
            workerPositions: settings.workerPositions,
            vehicleTypes: settings.vehicleTypes,
          }
        : null,
    });
  } catch (e: any) {
    console.error("GET config failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// Mutation only manager/admin creates SyncChange
// PATCH /api/rvb/config { currency }
router.patch("/", requireRvbRole("manager", "admin") as any, async (req: RvbAuthRequest, res) => {
  try {
    const { currency, language, customerTypes, workerPositions } = req.body as any;
    // Validate currency if provided
    if (currency !== undefined) {
      const c = String(currency).trim();
      if (!ALLOWED_CURRENCIES.includes(c as any)) {
        res.status(400).json({ success: false, code: "RVB_CURRENCY_INVALID" });
        return;
      }
    }
    if (language !== undefined) {
      const l = String(language).trim();
      if (!["ar", "fr", "en"].includes(l)) {
        res.status(400).json({ success: false, code: "RVB_LANGUAGE_INVALID" });
        return;
      }
    }

    const session = await mongoose.startSession();
    let saved: any = null;
    let revision: number | null = null;
    try {
      await session.withTransaction(async () => {
        let settings: any = await SettingsModel.findOne({ id: "settings" }).session(session);
        if (!settings) {
          settings = await SettingsModel.findOne({}).session(session);
        }
        if (!settings) {
          // Create initial settings document
          const now = Date.now();
          revision = await allocateRevision(session);
          const newDoc: any = {
            id: "settings",
            language: language ? String(language).trim() : "ar",
            currency: currency ? String(currency).trim() : DEFAULT_CURRENCY,
            customerTypes: Array.isArray(customerTypes) ? customerTypes.map((x: any) => String(x).trim()).filter(Boolean) : ["Particulier", "Entreprise"],
            workerPositions: Array.isArray(workerPositions) ? workerPositions.map((x: any) => String(x).trim()).filter(Boolean) : ["Boucher", "Helper"],
            vehicleTypes: [],
            syncStatus: "synced",
            lastSyncedAt: now,
            serverRevision: revision,
          };
          const created = await SettingsModel.create([newDoc], { session } as any);
          saved = created[0];
          const payload = saved.toObject ? saved.toObject() : { ...newDoc };
          const { SyncChangeModel } = await import("../models/sync-change.model");
          await SyncChangeModel.create(
            [
              {
                revision,
                entity: "settings",
                entityId: newDoc.id,
                operation: "create",
                payload,
                changedAt: new Date(),
                sourceClientId: "rvb-server",
                operationId: `rvb-settings-${newDoc.id}-${revision}`,
              },
            ],
            { session },
          );
          return;
        }

        // Update existing
        if (currency !== undefined) settings.currency = String(currency).trim();
        if (language !== undefined) settings.language = String(language).trim();
        if (Array.isArray(customerTypes)) settings.customerTypes = customerTypes.map((x: any) => String(x).trim()).filter(Boolean);
        if (Array.isArray(workerPositions)) settings.workerPositions = workerPositions.map((x: any) => String(x).trim()).filter(Boolean);

        revision = await allocateRevision(session);
        settings.serverRevision = revision;
        settings.syncStatus = "synced";
        settings.lastSyncedAt = Date.now();
        await settings.save({ session } as any);
        saved = settings;
        const payload = settings.toObject ? settings.toObject() : { ...settings };
        const { SyncChangeModel } = await import("../models/sync-change.model");
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: "settings",
              entityId: settings.id,
              operation: "update",
              payload,
              changedAt: new Date(),
              sourceClientId: "rvb-server",
              operationId: `rvb-settings-${settings.id}-${revision}`,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    const fresh = saved?.toObject ? saved.toObject() : saved;
    const { _id, __v, ...rest } = fresh || {};

    try {
      await RvbActivityModel.create({
        id: `rvba-${uuidv4()}`,
        createdAt: Date.now(),
        actorAccountId: req.rvbUser!.accountId,
        actorTag: req.rvbUser!.tag,
        actorRole: req.rvbUser!.role,
        entityType: "system",
        entityId: (saved?.id as string) || "settings",
        action: "config_updated",
        sourceType: "system",
        sourceId: (saved?.id as string) || "settings",
        title: `Config updated`,
        details: `Currency ${currency || rest.currency} by @${req.rvbUser!.tag}`,
      } as any);
    } catch {}

    res.json({ success: true, config: rest, currency: rest?.currency || DEFAULT_CURRENCY, revision });
  } catch (e: any) {
    console.error("PATCH config failed", e);
    const status = e?.status || 500;
    const code = e?.code || "INTERNAL_ERROR";
    res.status(status).json({ success: false, code, message: e?.message || code });
  }
});

export default router;
