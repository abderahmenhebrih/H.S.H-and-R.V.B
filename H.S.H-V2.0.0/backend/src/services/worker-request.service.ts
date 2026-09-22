import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { WorkerModel } from "../models/worker.model";
import { WorkerRequestModel } from "../models/worker-request.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { createRvbNotification } from "./rvb-notification.service";
import { PaymentModel } from "../models/payment.model";
import { WorkerFinancialEventModel } from "../models/worker-financial-event.model";
import { allocateRevision, recordSyncChange } from "../sync/rvb-sync-helper";

function codeError(code: string, status: number, message?: string) {
  const err = new Error(message || code) as any;
  err.code = code;
  err.status = status;
  return err;
}

export type CreateWorkerRequestInput = {
  workerId: string;
  accountId?: string | null;
  type: "payment" | "loan" | "discrepancy";
  amount?: number | null;
  description?: string | null;
};

export async function createWorkerRequest(input: CreateWorkerRequestInput) {
  const { workerId, accountId, type, amount, description } = input;
  if (!workerId) throw codeError("RVB_WORKER_REQUIRED", 400);
  if (!["payment", "loan", "discrepancy"].includes(type)) throw codeError("RVB_REQUEST_TYPE_INVALID", 400);

  const worker: any = await WorkerModel.findOne({ id: workerId }).lean();
  if (!worker) throw codeError("RVB_WORKER_NOT_FOUND", 404);

  if (accountId) {
    const acc: any = await RvbAccountModel.findOne({ id: accountId }).lean();
    if (!acc) throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);
    if (acc.linkedEntityType === "worker" && acc.linkedEntityId !== workerId) {
      throw codeError("RVB_FORBIDDEN", 403);
    }
  }

  if (type === "payment") {
    if (amount === undefined || amount === null || typeof amount !== "number" || amount <= 0) throw codeError("RVB_AMOUNT_REQUIRED", 400);
    const credit = Number(worker.balance) || 0;
    if (amount > credit) throw codeError("RVB_PAYMENT_EXCEEDS_CREDIT", 400);
  }
  if (type === "loan") {
    if (amount === undefined || amount === null || typeof amount !== "number" || amount <= 0) throw codeError("RVB_AMOUNT_REQUIRED", 400);
    const credit = Number(worker.balance) || 0;
    if (amount <= credit) throw codeError("RVB_LOAN_AMOUNT_INVALID", 400);
  }
  if (type === "discrepancy" && !description?.trim()) {
    throw codeError("RVB_DESCRIPTION_REQUIRED", 400);
  }

  const now = Date.now();
  const doc: any = {
    id: `wkrq-${uuidv4()}`,
    createdAt: now,
    updatedAt: now,
    workerId,
    accountId: accountId || null,
    type,
    status: "under_review" as const,
    amount: amount ?? null,
    description: description?.trim() || null,
    submittedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    notes: null,
    paymentId: null,
    financialEventId: null,
  };
  const created = await WorkerRequestModel.create(doc);
  // Notify management via centralized R.V.B channel
  try {
    const sourceEventId = `worker-request:${doc.id}:submitted`;
    await createRvbNotification({
      type: "worker",
      severity: "info",
      title: type === "payment" ? "New payment request" : type === "loan" ? "New loan application" : "New worker discrepancy",
      message: `${worker.name} submitted ${type} request`,
      entityType: "worker",
      entityId: doc.id,
      route: "/rvb/requests",
      sourceEventId,
      audienceType: "role",
      audienceIds: ["manager", "admin"],
      priority: type === "payment" || type === "loan" ? "high" : "normal",
      category: "requests",
    } as any);
  } catch {}
  try {
    const { RvbActivityModel } = await import("../models/rvb-activity.model");
    const submitterAcc: any = accountId ? await RvbAccountModel.findOne({ id: accountId }).lean() : null;
    await RvbActivityModel.create({ id: `rvba-${uuidv4()}`, createdAt: now, actorAccountId: accountId || null, actorTag: submitterAcc?.tag || null, actorRole: submitterAcc?.role || null, entityType: "worker", entityId: workerId, action: `request_submitted:${type}`, sourceType: "requests", sourceId: doc.id, title: `${worker.name} submitted ${type} request`, details: `Worker ${worker.name} ${type} ${amount ? amount + " DA" : ""}`.trim() } as any);
  } catch {}
  return created.toObject ? created.toObject() : created;
}

export async function listWorkerRequests(workerId?: string) {
  const filter: any = {};
  if (workerId) filter.workerId = workerId;
  const docs = await WorkerRequestModel.find(filter).sort({ submittedAt: -1 }).lean();
  return docs;
}

export async function reviewWorkerRequest(id: string, status: "accepted" | "rejected", reviewerId: string, notes?: string) {
  if (!["accepted", "rejected"].includes(status)) throw codeError("RVB_STATUS_INVALID", 400);
  const session = await mongoose.startSession();
  let savedReq: any = null;
  try {
    await session.withTransaction(async () => {
      const req: any = await WorkerRequestModel.findOne({ id }).session(session);
      if (!req) throw codeError("RVB_REQUEST_NOT_FOUND", 404);
      if (req.status !== "under_review") throw codeError("RVB_REQUEST_ALREADY_REVIEWED", 400);

      if (status === "accepted") {
        const worker: any = await WorkerModel.findOne({ id: req.workerId }).session(session);
        if (!worker) throw codeError("RVB_WORKER_NOT_FOUND", 404);
        if (req.type === "payment") {
          const amount = Number(req.amount) || 0;
          if (amount <= 0) throw codeError("RVB_AMOUNT_REQUIRED", 400);
          const credit = Number(worker.balance) || 0;
          if (amount > credit) throw codeError("RVB_PAYMENT_EXCEEDS_CREDIT", 400);
          if (worker.status !== "active") throw codeError("RVB_WORKER_ARCHIVED", 400);
          if (!req.paymentId) {
            const before = credit;
            const after = before - amount;
            const now = Date.now();
            const paymentId = `pay-${uuidv4()}`;
            // Allocate revision for Payment
            const payRev = await allocateRevision(session);
            const paymentDoc: any = {
              id: paymentId,
              createdAt: now,
              updatedAt: now,
              syncStatus: "synced",
              serverRevision: payRev,
              entityType: "worker",
              entityId: worker.id,
              accountId: reviewerId as any,
              amount,
              date: now,
              note: `Payment request ${req.id} accepted`,
            };
            await PaymentModel.create([paymentDoc], { session } as any);
            await recordSyncChange(session, { entity: "payment", entityId: paymentId, operation: "create", payload: { ...paymentDoc } });
            // Worker update with revision
            worker.balance = after;
            worker.updatedAt = now;
            const workerRev = await allocateRevision(session);
            worker.serverRevision = workerRev;
            await worker.save({ session } as any);
            await recordSyncChange(session, { entity: "worker", entityId: worker.id, operation: "update", payload: worker.toObject ? worker.toObject() : worker });
            const eventId = `wkfe-${uuidv4()}`;
            await WorkerFinancialEventModel.create(
              [
                {
                  id: eventId,
                  createdAt: now,
                  updatedAt: now,
                  workerId: worker.id,
                  type: "payment",
                  amount,
                  balanceBefore: before,
                  balanceAfter: after,
                  note: `Payment request ${req.id}`,
                  actorId: reviewerId,
                  referenceId: req.id,
                },
              ],
              { session } as any,
            );
            req.paymentId = paymentId;
            req.financialEventId = eventId;
          }
        } else if (req.type === "loan") {
          const amount = Number(req.amount) || 0;
          if (amount <= 0) throw codeError("RVB_AMOUNT_REQUIRED", 400);
          if (worker.status !== "active") throw codeError("RVB_WORKER_ARCHIVED", 400);
          // Revalidate loan > credit at review time where possible
          const creditAtReview = Number(worker.balance) || 0;
          if (amount <= creditAtReview) throw codeError("RVB_LOAN_AMOUNT_INVALID", 400);
          if (!req.financialEventId) {
            const before = Number(worker.balance) || 0;
            const after = before + amount;
            const now = Date.now();
            worker.balance = after;
            worker.updatedAt = now;
            const workerRev = await allocateRevision(session);
            worker.serverRevision = workerRev;
            await worker.save({ session } as any);
            await recordSyncChange(session, { entity: "worker", entityId: worker.id, operation: "update", payload: worker.toObject ? worker.toObject() : worker });
            const eventId = `wkfe-${uuidv4()}`;
            await WorkerFinancialEventModel.create(
              [
                {
                  id: eventId,
                  createdAt: now,
                  updatedAt: now,
                  workerId: worker.id,
                  type: "loan",
                  amount,
                  balanceBefore: before,
                  balanceAfter: after,
                  note: `Loan ${req.id} accepted`,
                  actorId: reviewerId,
                  referenceId: req.id,
                },
              ],
              { session } as any,
            );
            req.financialEventId = eventId;
          }
        }
      }

      req.status = status;
      req.reviewedAt = Date.now();
      req.reviewedBy = reviewerId;
      req.notes = notes?.trim() || null;
      req.updatedAt = Date.now();
      await req.save({ session } as any);
      savedReq = req.toObject ? req.toObject() : { ...req };
    });
  } finally {
    await session.endSession();
  }

  const req = savedReq;
  if (!req) throw codeError("RVB_REQUEST_NOT_FOUND", 404);

  // Post-commit side effects (must not roll back business transaction)
  try {
    const { WorkerActivityModel } = await import("../models/worker-activity.model");
    const reviewerAcc: any = await RvbAccountModel.findOne({ id: reviewerId }).lean();
    await WorkerActivityModel.create({
      id: `wka-${uuidv4()}`,
      createdAt: Date.now(),
      workerId: req.workerId,
      accountId: reviewerId,
      action: status === "accepted" ? `request_accepted:${req.type}` : `request_rejected:${req.type}`,
      details: `${req.type} ${status} amount=${req.amount ?? ""} payment=${req.paymentId || ""} ${notes || ""}`.trim(),
      actorId: reviewerId,
      actorTag: reviewerAcc?.tag || null,
    } as any);
  } catch {}
  try {
    const sourceEventId = `worker-request:${req.id}:${status}`;
    const targetAcc: any = (await RvbAccountModel.findOne({ id: req.accountId }).lean()) || (await RvbAccountModel.findOne({ linkedEntityType: "worker", linkedEntityId: req.workerId }).lean());
    await createRvbNotification({
      type: "worker",
      severity: status === "accepted" ? "success" : "warning",
      title: status === "accepted" ? "Request accepted" : "Request rejected",
      message: `Your ${req.type} request was ${status}`,
      entityType: "worker",
      entityId: req.id,
      route: "/rvb/requests",
      sourceEventId,
      audienceType: targetAcc ? "user" : "role",
      audienceIds: targetAcc ? [targetAcc.id] : ["worker"],
      priority: "high",
      category: "statusUpdates",
    } as any);
  } catch {}
  try {
    const { RvbActivityModel } = await import("../models/rvb-activity.model");
    const reviewerAcc: any = await RvbAccountModel.findOne({ id: reviewerId }).lean();
    await RvbActivityModel.create({
      id: `rvba-${uuidv4()}`,
      createdAt: Date.now(),
      actorAccountId: reviewerId,
      actorTag: reviewerAcc?.tag || null,
      actorRole: reviewerAcc?.role || null,
      entityType: "worker",
      entityId: req.workerId,
      action: status === "accepted" ? `request_accepted:${req.type}` : `request_rejected:${req.type}`,
      sourceType: "requests",
      sourceId: req.id,
      title: `Payment request ${status}`,
      details: `${req.type} ${status} by @${reviewerAcc?.tag || reviewerId}`,
    } as any);
  } catch {}

  return req;
}
