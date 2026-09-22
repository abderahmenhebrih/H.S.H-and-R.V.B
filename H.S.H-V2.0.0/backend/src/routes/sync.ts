import { Router } from "express";
import { getModel, modelRegistry } from "../sync/model-registry";
import type { SyncRequest, SyncResponse } from "../sync/types";
import { getChangesAfter, getCurrentRevision, processSyncOperations } from "../sync/sync-service";
import { SyncChangeModel } from "../models/sync-change.model";

const router = Router();

router.post("/", async (req, res) => {
  const body = req.body as Partial<SyncRequest>;

  if (!Array.isArray(body.operations)) {
    const response: SyncResponse = {
      success: false,
      results: [],
    };
    res.status(400).json(response);
    return;
  }

  if (body.operations.length === 0) {
    const currentRevision = await getCurrentRevision();
    const response: SyncResponse = {
      success: true,
      results: [],
      currentRevision,
    };
    res.json(response);
    return;
  }

  for (const operation of body.operations) {
    if (
      !operation ||
      typeof operation.entity !== "string" ||
      operation.entity.length === 0 ||
      typeof operation.entityId !== "string" ||
      operation.entityId.length === 0 ||
      !["create", "update", "delete", "upsert"].includes(operation.operation) ||
      typeof operation.createdAt !== "number" ||
      !Number.isFinite(operation.createdAt) ||
      typeof (operation as any).operationId !== "string" ||
      (operation as any).operationId.length === 0
    ) {
      const response: SyncResponse = {
        success: false,
        results: [],
      };
      res.status(400).json(response);
      return;
    }
    // Validate entity is registered
    if (!((operation.entity as string) in modelRegistry)) {
      const response: SyncResponse = {
        success: false,
        results: [],
      };
      res.status(400).json(response);
      return;
    }
  }

  try {
    const results = await processSyncOperations(body.operations as any);
    const currentRevision = await getCurrentRevision();
    const response: SyncResponse = {
      success: results.every((result) => result.success),
      results,
      currentRevision,
    };
    res.json(response);
  } catch (error) {
    const response: SyncResponse = {
      success: false,
      results: [],
    };
    console.error("Sync request failed:", error instanceof Error ? error.message : error);
    res.status(500).json(response);
  }
});

router.get("/changes", async (req, res) => {
  try {
    const afterParam = req.query.after as string | undefined;
    const limitParam = req.query.limit as string | undefined;
    const after = afterParam ? parseInt(afterParam, 10) : 0;
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 500) : 200;
    const safeAfter = Number.isFinite(after) && after >= 0 ? after : 0;
    const safeLimit = Number.isFinite(limit) ? limit : 200;
    const { changes, nextRevision, hasMore, currentRevision } = await getChangesAfter(safeAfter, safeLimit);
    res.json({ changes, nextRevision, hasMore, currentRevision });
  } catch (error) {
    console.error("Sync changes failed:", error);
    res.status(500).json({ changes: [], nextRevision: 0, hasMore: false, currentRevision: 0 });
  }
});

router.get("/bootstrap", async (req, res) => {
  try {
    const currentRevision = await getCurrentRevision();
    const snapshot: Record<string, any[]> = {};
    for (const [entity, model] of Object.entries(modelRegistry)) {
      const docs = await (model as any).find().lean();
      // Strip Mongo _id/__v and keep id
      snapshot[entity] = docs.map((d: any) => {
        const { _id, __v, ...rest } = d;
        return rest;
      });
    }
    res.json({ snapshot, currentRevision });
  } catch (error) {
    console.error("Bootstrap failed:", error);
    res.status(500).json({ snapshot: {}, currentRevision: 0 });
  }
});

router.get("/status", async (_req, res) => {
  try {
    const currentRevision = await getCurrentRevision();
    res.json({ currentRevision });
  } catch (error) {
    res.status(500).json({ currentRevision: 0 });
  }
});

export default router;
