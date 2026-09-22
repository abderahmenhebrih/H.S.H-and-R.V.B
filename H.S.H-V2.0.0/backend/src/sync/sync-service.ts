import mongoose from "mongoose";
import { getModel } from "./model-registry";
import type { SyncRequestOperation, SyncOperationResult, SyncChange } from "./types";
import { SyncCounterModel } from "../models/sync-counter.model";
import { SyncChangeModel } from "../models/sync-change.model";
import { ProcessedSyncOperationModel } from "../models/processed-sync-operation.model";
import { SupplierModel } from "../models/supplier.model";
import { IncomingInvoiceModel } from "../models/incoming-invoice.model";

type SyncModel = {
  findOne: (filter: { id: string }) => Promise<any>;
  create: (payload: Record<string, unknown>) => Promise<any>;
  updateOne: (filter: { id: string }, update: { $set: Record<string, unknown> }) => Promise<any>;
  deleteOne: (filter: { id: string }) => Promise<any>;
  findById?: (id: string) => Promise<any>;
};

function getSyncModel(entity: string): SyncModel {
  return getModel(entity) as unknown as SyncModel;
}

async function getNextRevision(session?: any): Promise<number> {
  const opts = session ? { session } : {};
  const doc = await SyncCounterModel.findOneAndUpdate(
    { name: "global" },
    { $inc: { revision: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...opts },
  );
  if (!doc) {
    const created = await SyncCounterModel.create([{ name: "global", revision: 1 }], opts as any);
    return (created[0] as any).revision;
  }
  if (typeof (doc as any).revision !== "number") {
    await SyncCounterModel.updateOne({ name: "global" }, { $set: { revision: 1 } }, opts as any);
    return 1;
  }
  return (doc as any).revision;
}

function isTransientError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  // Transient Mongo errors that should be retryable
  if (msg.includes("TransientTransactionError")) return true;
  if (msg.includes("UnknownTransactionCommitResult")) return true;
  if (msg.includes("NetworkTimeout")) return true;
  if (msg.includes("MongoNetworkError")) return true;
  if (msg.includes("NoSuchTransaction")) return true;
  if (msg.includes("WriteConflict")) return true;
  // Validation/terminal errors
  if (msg.includes("Unsupported")) return false;
  if (msg.includes("Entity not found")) return false;
  if (msg.includes("Missing operationId")) return false;
  // Default: treat as transient for safety (allow retry) unless explicitly terminal
  // For now, only validation errors are terminal; others are transient
  const terminalKeywords = ["Unsupported", "Entity not found", "Missing", "Invalid entity", "Validation"];
  for (const kw of terminalKeywords) if (msg.includes(kw)) return false;
  return true;
}

export async function validateIncomingInvoiceSync(payload: Record<string, unknown>, operation: SyncRequestOperation): Promise<string | null> {
  // Only validate create/upsert/update for incomingInvoice
  if (payload == null || typeof payload !== "object") return "INCOMING_AMOUNT_INVALID";
  const p: any = payload;
  // For update, we may have partial payload; fetch existing to fill missing for validation if needed
  let existing: any = null;
  if (operation.operation === "update") {
    try {
      existing = await IncomingInvoiceModel.findOne({ id: operation.entityId }).lean();
    } catch {}
  }
  const supplierId = p.supplierId ?? existing?.supplierId;
  const supplierInvoiceNumberRaw = p.supplierInvoiceNumber ?? p.number ?? existing?.supplierInvoiceNumber;
  const invoiceDateRaw = p.invoiceDate ?? p.date ?? existing?.invoiceDate;
  const currencyCode = p.currencyCode ?? existing?.currencyCode;
  const amountHTRaw = p.amountHT ?? p.total ?? existing?.amountHT;
  const amountTTCRaw = p.amountTTC ?? p.total ?? existing?.amountTTC ?? p.amountHT ?? existing?.amountHT;
  const taxAmountRaw = p.taxAmount ?? existing?.taxAmount;

  // supplierId must reference existing Supplier (server data)
  if (!supplierId || typeof supplierId !== "string") return "SUPPLIER_NOT_FOUND";
  try {
    const sup = await SupplierModel.findOne({ id: String(supplierId) }).lean();
    if (!sup) return "SUPPLIER_NOT_FOUND";
  } catch {
    return "SUPPLIER_NOT_FOUND";
  }

  // supplierInvoiceNumber trimmed non-empty
  if (supplierInvoiceNumberRaw == null) return "SUPPLIER_INVOICE_NUMBER_REQUIRED";
  const trimmed = String(supplierInvoiceNumberRaw).trim();
  if (!trimmed) return "SUPPLIER_INVOICE_NUMBER_REQUIRED";

  // invoiceDate valid finite
  if (invoiceDateRaw == null) return "INVOICE_DATE_INVALID";
  const ms = typeof invoiceDateRaw === "number" ? invoiceDateRaw : new Date(invoiceDateRaw).getTime();
  if (!Number.isFinite(ms)) return "INVOICE_DATE_INVALID";

  // currencyCode must be exactly one of DA, €, $
  const allowed = ["DA", "€", "$"];
  if (currencyCode != null && String(currencyCode).trim() !== "") {
    if (!allowed.includes(String(currencyCode).trim())) return "INVOICE_CURRENCY_INVALID";
  } else if (operation.operation === "create" || operation.operation === "upsert") {
    // For create, if no currency provided, we will fallback to DA via route, but sync should require explicit valid or fallback? Require valid if missing? Treat missing as not invalid here, will use fallback in direct route, but for sync we check final resolved would be DA so not invalid.
    // However if payload has no currency and existing also none, that's not invalid for our check — allow.
  }
  // If currencyCode provided empty and we are create, fallback would be DA, so not invalid.
  // Only reject if explicit invalid.
  if (currencyCode != null && String(currencyCode).trim() !== "" && !allowed.includes(String(currencyCode).trim())) {
    return "INVOICE_CURRENCY_INVALID";
  }
  // Also if after fallback final would be invalid, but sync payload missing currency should not be rejected here; direct route would fallback to DA.

  // amounts validation
  // For update with partial, use provided or existing
  const htRaw = p.amountHT ?? p.total ?? existing?.amountHT;
  const ttcRaw = p.amountTTC ?? p.total ?? existing?.amountTTC;
  if (htRaw == null || ttcRaw == null) {
    // For create, missing amounts is invalid
    if (operation.operation === "create" || operation.operation === "upsert") return "INCOMING_AMOUNT_INVALID";
    // For update, if not provided, skip amount check
  } else {
    const htNum = Number(htRaw);
    const ttcNum = Number(ttcRaw);
    const taxNum = taxAmountRaw != null ? Number(taxAmountRaw) : (Number.isFinite(htNum) && Number.isFinite(ttcNum) ? ttcNum - htNum : NaN);
    if (!Number.isFinite(htNum) || !Number.isFinite(ttcNum) || (taxAmountRaw != null && !Number.isFinite(taxNum)) || htNum < 0 || ttcNum < 0 || (taxAmountRaw != null && taxNum < 0) || ttcNum < htNum) {
      return "INCOMING_AMOUNT_INVALID";
    }
    if (taxAmountRaw != null && taxNum < 0) return "INCOMING_AMOUNT_INVALID";
  }

  // Duplicate protection: same supplierId + supplierInvoiceNumber uniqueness
  try {
    const supplierIdToCheck = String(supplierId);
    const numberToCheck = trimmed;
    // For create/upsert, check if any document with same supplierId+number exists with different id
    const dup = await IncomingInvoiceModel.findOne({ supplierId: supplierIdToCheck, supplierInvoiceNumber: numberToCheck }).lean();
    if (dup && String((dup as any).id) !== String(operation.entityId)) {
      return "INCOMING_INVOICE_DUPLICATE";
    }
  } catch {}

  return null;
}

export async function processSyncOperation(
  operation: SyncRequestOperation,
): Promise<SyncOperationResult> {
  const opId = operation.operationId;
  if (!opId || typeof opId !== "string") {
    return {
      operationId: opId ?? "unknown",
      entity: operation.entity,
      entityId: operation.entityId,
      operation: operation.operation,
      success: false,
      message: "Missing operationId",
      error: "operationId required",
      retryable: false,
    };
  }

  // Idempotency check
  const existingProcessed = await ProcessedSyncOperationModel.findOne({ operationId: opId });
  if (existingProcessed) {
    const isTerminalFailure = !existingProcessed.success;
    return {
      operationId: opId,
      entity: existingProcessed.entity,
      entityId: existingProcessed.entityId,
      operation: existingProcessed.operation as any,
      success: existingProcessed.success,
      message: existingProcessed.success ? "Already processed" : (existingProcessed.error as string) ?? "Failed before",
      revision: (existingProcessed.revision as number | undefined) ?? undefined,
      canonicalEntity: (existingProcessed.canonicalEntity as unknown) ?? undefined,
      conflict: (existingProcessed.conflict as boolean | undefined) ?? false,
      error: (existingProcessed.error as string | undefined) ?? undefined,
      retryable: isTerminalFailure ? ((existingProcessed as any).retryable ?? false) : undefined,
    };
  }

  let model: SyncModel;
  try {
    model = getSyncModel(operation.entity);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Unsupported entity";
    const result: SyncOperationResult = {
      operationId: opId,
      entity: operation.entity,
      entityId: operation.entityId,
      operation: operation.operation,
      success: false,
      message: errMsg,
      error: errMsg,
      retryable: false,
    };
    await ProcessedSyncOperationModel.create({
      operationId: opId,
      entity: operation.entity,
      entityId: operation.entityId,
      operation: operation.operation,
      success: false,
      error: errMsg,
      retryable: false,
      processedAt: new Date(),
      clientId: operation.clientId,
    });
    return result;
  }

  const payload =
    operation.payload && typeof operation.payload === "object"
      ? { ...(operation.payload as Record<string, unknown>) }
      : {};

  payload.id = operation.entityId;
  // H.S.H sync path must always set channel="hsh" for notifications
  if (operation.entity === "notification") {
    const p: any = payload;
    if (!p.channel || p.channel !== "hsh") p.channel = "hsh";
  }

  // Size safety for Office files (several MB per file, documented limit)
  if (operation.entity === "officeFile") {
    try {
      const content = (payload as any).content;
      if (content) {
        const size = JSON.stringify(content).length;
        const MAX = 5 * 1024 * 1024;
        if (size > MAX) {
          const err = `Office file content too large (${size} > ${MAX})`;
          await ProcessedSyncOperationModel.create({
            operationId: opId,
            entity: operation.entity,
            entityId: operation.entityId,
            operation: operation.operation,
            success: false,
            error: err,
            retryable: false,
            processedAt: new Date(),
            clientId: operation.clientId,
          });
          return {
            operationId: opId,
            entity: operation.entity,
            entityId: operation.entityId,
            operation: operation.operation,
            success: false,
            message: err,
            error: err,
            retryable: false,
          };
        }
      }
      const title = (payload as any).title;
      if (title && typeof title === "string" && title.length > 200) {
        const err = "Title too long";
        await ProcessedSyncOperationModel.create({
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: false,
          error: err,
          retryable: false,
          processedAt: new Date(),
          clientId: operation.clientId,
        });
        return {
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: false,
          message: err,
          error: err,
          retryable: false,
        };
      }
      // Validate linkedEntities structure
      const linked = (payload as any).linkedEntities;
      if (linked !== undefined && !Array.isArray(linked)) {
        const err = "Invalid linkedEntities";
        await ProcessedSyncOperationModel.create({
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: false,
          error: err,
          retryable: false,
          processedAt: new Date(),
          clientId: operation.clientId,
        });
        return {
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: false,
          message: err,
          error: err,
          retryable: false,
        };
      }
    } catch (e) {
      // If validation itself fails, treat as terminal
      const err = e instanceof Error ? e.message : "Validation error";
      return {
        operationId: opId,
        entity: operation.entity,
        entityId: operation.entityId,
        operation: operation.operation,
        success: false,
        message: err,
        error: err,
        retryable: false,
      };
    }
  }

  // IncomingInvoice generic sync validation — mirror POST /api/invoices/incoming
  if (operation.entity === "incomingInvoice" && (operation.operation === "create" || operation.operation === "upsert" || operation.operation === "update")) {
    const syncErr = await validateIncomingInvoiceSync(payload as Record<string, unknown>, operation);
    if (syncErr) {
      await ProcessedSyncOperationModel.create({
        operationId: opId,
        entity: operation.entity,
        entityId: operation.entityId,
        operation: operation.operation,
        success: false,
        error: syncErr,
        retryable: false,
        processedAt: new Date(),
        clientId: operation.clientId,
      });
      return {
        operationId: opId,
        entity: operation.entity,
        entityId: operation.entityId,
        operation: operation.operation,
        success: false,
        message: syncErr,
        error: syncErr,
        retryable: false,
      };
    }
  }

  // Ensure payload does not contain server-controlled fields that client shouldn't set arbitrarily
  // but we will set serverRevision ourselves

  let conflict = false;
  let revision: number | undefined;
  let canonical: any = undefined;

  // Use MongoDB transaction for atomic business + change log + idempotency
  const session = await mongoose.startSession();
  try {
    let result: SyncOperationResult | null = null;
    await session.withTransaction(async () => {
      // Re-check idempotency inside transaction
      const existingProcessedTx = await (ProcessedSyncOperationModel as any).findOne({ operationId: opId }).session(session);
      if (existingProcessedTx) {
        const isTerminalFailureTx = !existingProcessedTx.success;
        result = {
          operationId: opId,
          entity: existingProcessedTx.entity,
          entityId: existingProcessedTx.entityId,
          operation: existingProcessedTx.operation as any,
          success: existingProcessedTx.success,
          message: existingProcessedTx.success ? "Already processed" : (existingProcessedTx.error as string) ?? "Failed before",
          revision: (existingProcessedTx.revision as number | undefined) ?? undefined,
          canonicalEntity: (existingProcessedTx.canonicalEntity as unknown) ?? undefined,
          conflict: (existingProcessedTx.conflict as boolean | undefined) ?? false,
          error: (existingProcessedTx.error as string | undefined) ?? undefined,
          retryable: isTerminalFailureTx ? ((existingProcessedTx as any).retryable ?? false) : undefined,
        };
        return;
      }

      if (operation.operation === "create") {
        // INVOICE_IMMUTABLE: generic sync may create DRAFT only
        if (operation.entity === "invoice") {
          const st = (payload as any).status;
          if (st && st !== "DRAFT") {
            const err = "INVOICE_IMMUTABLE: generic sync may create DRAFT only";
            await ProcessedSyncOperationModel.create(
              [{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }],
              { session }
            );
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
            return;
          }
        }
        // Defense-in-depth: for notifications, check sourceEventId deduplication before id check - H.S.H only channel=hsh
        if (operation.entity === "notification" && (payload as any).sourceEventId) {
          const existingBySource = await (model as any).findOne({ channel: "hsh", sourceEventId: (payload as any).sourceEventId }).session(session as any);
          if (existingBySource) {
            canonical = existingBySource;
            revision = (existingBySource as any).serverRevision ?? 0;
            result = {
              operationId: opId,
              entity: operation.entity,
              entityId: (existingBySource as any).id,
              operation: operation.operation,
              success: true,
              message: "Notification already exists for sourceEventId.",
              revision,
              canonicalEntity: canonical,
              conflict: false,
            };
            await ProcessedSyncOperationModel.create(
              [
                {
                  operationId: opId,
                  entity: operation.entity,
                  entityId: operation.entityId,
                  operation: operation.operation,
                  success: true,
                  revision,
                  canonicalEntity: canonical,
                  conflict: false,
                  processedAt: new Date(),
                  clientId: operation.clientId,
                },
              ],
              { session },
            );
            return;
          }
        }
        const existing = await (model as any).findOne({ id: operation.entityId }).session(session as any);
        if (existing) {
          const existingRevision = (existing as any).serverRevision ?? 0;
          canonical = existing;
          revision = existingRevision;
          result = {
            operationId: opId,
            entity: operation.entity,
            entityId: operation.entityId,
            operation: operation.operation,
            success: true,
            message: "Entity already exists.",
            revision,
            canonicalEntity: canonical,
            conflict: false,
          };
          await ProcessedSyncOperationModel.create(
            [
              {
                operationId: opId,
                entity: operation.entity,
                entityId: operation.entityId,
                operation: operation.operation,
                success: true,
                revision,
                canonicalEntity: canonical,
                conflict: false,
                processedAt: new Date(),
                clientId: operation.clientId,
              },
            ],
            { session },
          );
          return;
        }
        // No global conflict check for create (only entity-specific, but create has no existing)
        revision = await getNextRevision(session);
        const toCreate: Record<string, unknown> = {
          ...payload,
          serverRevision: revision,
          syncStatus: "synced",
          lastSyncedAt: Date.now(),
          updatedAt: (payload as any).updatedAt ?? Date.now(),
          createdAt: (payload as any).createdAt ?? Date.now(),
        };
        const created = await (model as any).create([toCreate], { session });
        canonical = created[0] ?? toCreate;
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: "create",
              payload: canonical,
              changedAt: new Date(),
              sourceClientId: operation.clientId,
              operationId: opId,
            },
          ],
          { session },
        );
        await ProcessedSyncOperationModel.create(
          [
            {
              operationId: opId,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: operation.operation,
              success: true,
              revision,
              canonicalEntity: canonical,
              conflict: false,
              processedAt: new Date(),
              clientId: operation.clientId,
            },
          ],
          { session },
        );
        result = {
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: true,
          message: "Entity created.",
          revision,
          canonicalEntity: canonical,
          conflict,
        };
        return;
      }

      if (operation.operation === "upsert") {
        const existingUpsert: any = await (model as any).findOne({ id: operation.entityId }).session(session as any);
        if (existingUpsert) {
          // INVOICE_IMMUTABLE: reject generic mutations on ISSUED/CANCELLED and DRAFT->ISSUED/CANCELLED transitions
          if (operation.entity === "invoice") {
            const srvStatus = (existingUpsert as any).status;
            const reqStatus = (payload as any).status;
            if (srvStatus === "ISSUED" || srvStatus === "CANCELLED") {
              const err = "INVOICE_IMMUTABLE: cannot mutate issued/cancelled invoice via generic sync";
              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
              return;
            }
            if ((srvStatus === "DRAFT" || !srvStatus) && reqStatus && reqStatus !== "DRAFT") {
              const err = "INVOICE_IMMUTABLE: generic sync cannot transition DRAFT -> ISSUED/CANCELLED";
              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
              return;
            }
          }
          const existingRev = (existingUpsert as any).serverRevision ?? 0;
          if (operation.baseRevision !== undefined && operation.baseRevision < existingRev) {
            conflict = true;
          }
          revision = await getNextRevision(session);
          const toSet: Record<string, unknown> = {
            ...payload,
            serverRevision: revision,
            syncStatus: "synced",
            lastSyncedAt: Date.now(),
            updatedAt: Date.now(),
          };
          delete (toSet as any).id;
          await (model as any).updateOne({ id: operation.entityId }, { $set: toSet }, { session });
          const updated = await (model as any).findOne({ id: operation.entityId }).session(session as any);
          canonical = updated ?? { ...existingUpsert, ...toSet, id: operation.entityId };
          await SyncChangeModel.create(
            [
              {
                revision,
                entity: operation.entity,
                entityId: operation.entityId,
                operation: "update",
                payload: canonical,
                changedAt: new Date(),
                sourceClientId: operation.clientId,
                operationId: opId,
              },
            ],
            { session },
          );
          await ProcessedSyncOperationModel.create(
            [
              {
                operationId: opId,
                entity: operation.entity,
                entityId: operation.entityId,
                operation: operation.operation,
                success: true,
                revision,
                canonicalEntity: canonical,
                conflict,
                processedAt: new Date(),
                clientId: operation.clientId,
              },
            ],
            { session },
          );
          result = {
            operationId: opId,
            entity: operation.entity,
            entityId: operation.entityId,
            operation: operation.operation,
            success: true,
            message: "Entity upserted (updated).",
            revision,
            canonicalEntity: canonical,
            conflict,
          };
          return;
        } else {
          if (operation.entity === "invoice") {
            const st2 = (payload as any).status;
            if (st2 && st2 !== "DRAFT") {
              const err = "INVOICE_IMMUTABLE: generic sync may create DRAFT only";
              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
              return;
            }
          }
          revision = await getNextRevision(session);
          const toCreate: Record<string, unknown> = {
            ...payload,
            serverRevision: revision,
            syncStatus: "synced",
            lastSyncedAt: Date.now(),
            updatedAt: (payload as any).updatedAt ?? Date.now(),
            createdAt: (payload as any).createdAt ?? Date.now(),
          };
          const created = await (model as any).create([toCreate], { session });
          canonical = created[0] ?? toCreate;
          await SyncChangeModel.create(
            [
              {
                revision,
                entity: operation.entity,
                entityId: operation.entityId,
                operation: "create",
                payload: canonical,
                changedAt: new Date(),
                sourceClientId: operation.clientId,
                operationId: opId,
              },
            ],
            { session },
          );
          await ProcessedSyncOperationModel.create(
            [
              {
                operationId: opId,
                entity: operation.entity,
                entityId: operation.entityId,
                operation: operation.operation,
                success: true,
                revision,
                canonicalEntity: canonical,
                conflict: false,
                processedAt: new Date(),
                clientId: operation.clientId,
              },
            ],
            { session },
          );
          result = {
            operationId: opId,
            entity: operation.entity,
            entityId: operation.entityId,
            operation: operation.operation,
            success: true,
            message: "Entity upserted (created).",
            revision,
            canonicalEntity: canonical,
            conflict: false,
          };
          return;
        }
      }

      if (operation.operation === "update") {
        const existing: any = await (model as any).findOne({ id: operation.entityId }).session(session as any);
        if (!existing) {
          const err = "Entity not found.";
          result = {
            operationId: opId,
            entity: operation.entity,
            entityId: operation.entityId,
            operation: operation.operation,
            success: false,
            message: err,
            error: err,
            retryable: false,
          };
          // Only record terminal failure for update-not-found (terminal)
          await ProcessedSyncOperationModel.create(
            [
              {
                operationId: opId,
                entity: operation.entity,
                entityId: operation.entityId,
                operation: operation.operation,
                success: false,
                error: err,
                retryable: false,
                processedAt: new Date(),
                clientId: operation.clientId,
              },
            ],
            { session },
          );
          return;
        }
        // INVOICE_IMMUTABLE checks
        if (operation.entity === "invoice") {
          const srvStatus = (existing as any).status;
          const reqStatus = (payload as any).status;
          if (srvStatus === "ISSUED" || srvStatus === "CANCELLED") {
            const err = "INVOICE_IMMUTABLE: cannot mutate issued/cancelled invoice via generic sync";
            await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
            return;
          }
          if ((srvStatus === "DRAFT" || !srvStatus) && reqStatus && reqStatus !== "DRAFT") {
            const err = "INVOICE_IMMUTABLE: generic sync cannot transition DRAFT -> ISSUED/CANCELLED";
            await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
            return;
          }
        }
        const existingRev = (existing as any).serverRevision ?? 0;
        if (operation.baseRevision !== undefined && operation.baseRevision < existingRev) {
          conflict = true;
        }
        revision = await getNextRevision(session);
        const toSet: Record<string, unknown> = {
          ...payload,
          serverRevision: revision,
          syncStatus: "synced",
          lastSyncedAt: Date.now(),
          updatedAt: Date.now(),
        };
        delete (toSet as any).id;
        await (model as any).updateOne({ id: operation.entityId }, { $set: toSet }, { session });
        const updated = await (model as any).findOne({ id: operation.entityId }).session(session as any);
        canonical = updated ?? { ...existing, ...toSet, id: operation.entityId };
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: "update",
              payload: canonical,
              changedAt: new Date(),
              sourceClientId: operation.clientId,
              operationId: opId,
            },
          ],
          { session },
        );
        await ProcessedSyncOperationModel.create(
          [
            {
              operationId: opId,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: operation.operation,
              success: true,
              revision,
              canonicalEntity: canonical,
              conflict,
              processedAt: new Date(),
              clientId: operation.clientId,
            },
          ],
          { session },
        );
        result = {
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: true,
          message: "Entity updated.",
          revision,
          canonicalEntity: canonical,
          conflict,
        };
        return;
      }

      if (operation.operation === "delete") {
        const existing: any = await (model as any).findOne({ id: operation.entityId }).session(session as any);
        if (existing) {
          const existingRev = (existing as any).serverRevision ?? 0;
          if (operation.baseRevision !== undefined && operation.baseRevision < existingRev) {
            conflict = true;
          }
          // INVOICE_IMMUTABLE: only DRAFT may be deleted via generic sync
          if (operation.entity === "invoice") {
            const srvStatus = (existing as any).status;
            if (srvStatus === "ISSUED" || srvStatus === "CANCELLED") {
              const err = "INVOICE_IMMUTABLE: cannot delete issued/cancelled invoice via generic sync";
              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
              return;
            }
          }
        }
        revision = await getNextRevision(session);
        await (model as any).deleteOne({ id: operation.entityId }, { session });
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: "delete",
              payload: undefined,
              changedAt: new Date(),
              sourceClientId: operation.clientId,
              operationId: opId,
            },
          ],
          { session },
        );
        await ProcessedSyncOperationModel.create(
          [
            {
              operationId: opId,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: operation.operation,
              success: true,
              revision,
              canonicalEntity: undefined,
              conflict,
              processedAt: new Date(),
              clientId: operation.clientId,
            },
          ],
          { session },
        );
        result = {
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: true,
          message: "Entity deleted.",
          revision,
          conflict,
        };
        return;
      }

      throw new Error("Unsupported sync operation.");
    });
    if (result) return result;
    throw new Error("Transaction did not produce result");
  } catch (error) {
    let errMsg = error instanceof Error ? error.message : "Unknown sync error";
    // Map Mongo duplicate key to stable code for incomingInvoice
    if (operation.entity === "incomingInvoice" && (errMsg.includes("E11000") || errMsg.toLowerCase().includes("duplicate"))) {
      errMsg = "INCOMING_INVOICE_DUPLICATE";
    }
    const transient = errMsg === "INCOMING_INVOICE_DUPLICATE" ? false : isTransientError(error);
    if (!transient) {
      try {
        await ProcessedSyncOperationModel.create({
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: false,
          error: errMsg,
          retryable: false,
          processedAt: new Date(),
          clientId: operation.clientId,
        });
      } catch {}
    }
    return {
      operationId: opId,
      entity: operation.entity,
      entityId: operation.entityId,
      operation: operation.operation,
      success: false,
      message: errMsg,
      error: errMsg,
      retryable: transient,
    };
  } finally {
    try {
      await session.endSession();
    } catch {}
  }
  }

export async function processSyncOperations(
  operations: SyncRequestOperation[],
): Promise<SyncOperationResult[]> {
  const results: SyncOperationResult[] = [];
  for (const operation of operations) {
    results.push(await processSyncOperation(operation));
  }
  return results;
}

export async function getCurrentRevision(): Promise<number> {
  const doc = await SyncCounterModel.findOne({ name: "global" });
  return doc?.revision ?? 0;
}

export async function getChangesAfter(
  after: number,
  limit = 200,
): Promise<{ changes: SyncChange[]; nextRevision: number; hasMore: boolean; currentRevision: number }> {
  const currentRevision = await getCurrentRevision();
  const changes = await SyncChangeModel.find({ revision: { $gt: after } })
    .sort({ revision: 1 })
    .limit(limit)
    .lean();
  const nextRevision = changes.length > 0 ? changes[changes.length - 1].revision : after;
  const hasMore = changes.length === limit && nextRevision < currentRevision;
  // H.S.H sync must exclude R.V.B notifications: filter notification changes to channel=hsh only
  const filtered = changes.filter((c: any) => {
    if (c.entity === "notification") {
      const payload: any = c.payload;
      // Delete ops have no payload – keep them? Only keep if previous payload was hsh? For safety exclude deletes without payload channel check? But deletes for RVB should not leak – they have no payload, we cannot know channel. We conservatively exclude deletes where entity notification and operation delete? However HSH deletes are expected to be hsh. For now keep deletes that are not obviously rvb (payload missing => keep). But if payload has channel and it's not hsh, exclude.
      if (payload && typeof payload === "object" && payload.channel && payload.channel !== "hsh") return false;
      // If payload missing channel but has rvb route/sourceEventId patterns, treat as rvb and exclude?
      if (payload && typeof payload === "object") {
        const route = payload.route as string | undefined;
        const src = payload.sourceEventId as string | undefined;
        if (route && route.startsWith("/rvb")) return false;
        if (src && /^(worker-request:|supplier-request:|customer-request:|customer-order:|chat:)/.test(src)) return false;
      }
      // otherwise keep (hsh)
    }
    return true;
  });
  // Map to SyncChange type
  const mapped: SyncChange[] = filtered.map((c: any) => ({
    revision: c.revision,
    entity: c.entity,
    entityId: c.entityId,
    operation: c.operation,
    payload: c.payload,
    changedAt: c.changedAt,
    sourceClientId: c.sourceClientId,
    operationId: c.operationId,
  }));
  return { changes: mapped, nextRevision, hasMore, currentRevision };
}

export async function getBootstrapData(): Promise<{ changes: SyncChange[]; currentRevision: number }> {
  const currentRevision = await getCurrentRevision();
  // If no SyncChange history, we need to snapshot existing Mongo collections
  const count = await SyncChangeModel.countDocuments();
  if (count === 0) {
    // Seed from existing data: iterate all models and create synthetic changes at revision 0
    // For bootstrap, we will collect all entities and return as creates with revision 0
    // But to avoid huge snapshot, return empty and let client know revision 0
    // Client will then do snapshot via separate bootstrap endpoint that dumps all entities
    return { changes: [], currentRevision };
  }
  const all = await SyncChangeModel.find().sort({ revision: 1 }).lean();
  const mapped: SyncChange[] = all.map((c: any) => ({
    revision: c.revision,
    entity: c.entity,
    entityId: c.entityId,
    operation: c.operation,
    payload: c.payload,
    changedAt: c.changedAt,
    sourceClientId: c.sourceClientId,
    operationId: c.operationId,
  }));
  return { changes: mapped, currentRevision };
}



