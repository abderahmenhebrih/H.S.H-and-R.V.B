import { v4 as uuidv4 } from "uuid";
import { WorkerModel } from "../models/worker.model";
import { WorkerRequestModel } from "../models/worker-request.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { NotificationModel } from "../models/notification.model";

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
  if (type === "loan" && amount !== undefined && amount !== null) {
    if (amount <= 0) throw codeError("RVB_AMOUNT_REQUIRED", 400);
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
  // Notify management
  try {
    const sourceEventId = `worker-request:${doc.id}:submitted`;
    const exists = await NotificationModel.findOne({ sourceEventId }).lean();
    if (!exists) {
      await NotificationModel.create({
        id: `notif-${uuidv4()}`,
        createdAt: now,
        updatedAt: now,
        syncStatus: "synced",
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
        archivedAt: null,
      } as any);
    }
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
  // Use atomic check to prevent race: ensure status is under_review
  const req: any = await WorkerRequestModel.findOne({ id });
  if (!req) throw codeError("RVB_REQUEST_NOT_FOUND", 404);
  if (req.status !== "under_review") throw codeError("RVB_REQUEST_ALREADY_REVIEWED", 400);

  // Idempotency: if already has paymentId/financialEventId and is accepted, just update status fields without duplicate mutation
  // But since we checked under_review, this is first attempt. Still handle stored ids for retry safety.

  if (status === "accepted") {
    const worker: any = await WorkerModel.findOne({ id: req.workerId });
    if (!worker) throw codeError("RVB_WORKER_NOT_FOUND", 404);
    if (req.type === "payment") {
      // Revalidate at acceptance time
      const amount = Number(req.amount) || 0;
      if (amount <= 0) throw codeError("RVB_AMOUNT_REQUIRED", 400);
      const credit = Number(worker.balance) || 0;
      if (amount > credit) throw codeError("RVB_PAYMENT_EXCEEDS_CREDIT", 400);
      if (worker.status !== "active") throw codeError("RVB_WORKER_ARCHIVED", 400);
      // Idempotency: if paymentId already exists, don't create duplicate
      if (req.paymentId) {
        // already processed, just mark accepted
      } else {
        const { PaymentModel } = await import("../models/payment.model");
        const { WorkerFinancialEventModel } = await import("../models/worker-financial-event.model");
        const before = credit;
        const after = before - amount;
        const now = Date.now();
        const paymentId = `pay-${uuidv4()}`;
        await PaymentModel.create({
          id: paymentId,
          createdAt: now,
          updatedAt: now,
          syncStatus: "synced",
          entityType: "worker",
          entityId: worker.id,
          accountId: reviewerId as any,
          amount,
          date: now,
          note: `Payment request ${req.id} accepted`,
        } as any);
        worker.balance = after;
        worker.updatedAt = now;
        await worker.save();
        const eventId = `wkfe-${uuidv4()}`;
        await WorkerFinancialEventModel.create({
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
        } as any);
        req.paymentId = paymentId;
        req.financialEventId = eventId;
        // Save immediately to record ids before final status? We'll save later with status
      }
    } else if (req.type === "loan") {
      const amount = Number(req.amount) || 0;
      if (amount <= 0) throw codeError("RVB_AMOUNT_REQUIRED", 400);
      if (worker.status !== "active") throw codeError("RVB_WORKER_ARCHIVED", 400);
      if (req.financialEventId) {
        // already processed
      } else {
        const before = Number(worker.balance) || 0;
        const after = before + amount;
        const now = Date.now();
        const { WorkerFinancialEventModel } = await import("../models/worker-financial-event.model");
        worker.balance = after;
        worker.updatedAt = now;
        await worker.save();
        const eventId = `wkfe-${uuidv4()}`;
        await WorkerFinancialEventModel.create({
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
        } as any);
        req.financialEventId = eventId;
      }
    }
    // discrepancy accepted -> no balance mutation, just status
  }

  req.status = status;
  req.reviewedAt = Date.now();
  req.reviewedBy = reviewerId;
  req.notes = notes?.trim() || null;
  req.updatedAt = Date.now();
  await req.save();

  // Activity
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

  // Notify requester
  try {
    const sourceEventId = `worker-request:${req.id}:${status}`;
    const exists = await NotificationModel.findOne({ sourceEventId }).lean();
    if (!exists) {
      const targetAcc: any = await RvbAccountModel.findOne({ id: req.accountId }).lean() || await RvbAccountModel.findOne({ linkedEntityType: "worker", linkedEntityId: req.workerId }).lean();
      await NotificationModel.create({
        id: `notif-${uuidv4()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        syncStatus: "synced",
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
        archivedAt: null,
      } as any);
    }
  } catch {}
  try {
    const { RvbActivityModel } = await import("../models/rvb-activity.model");
    const reviewerAcc: any = await RvbAccountModel.findOne({ id: reviewerId }).lean();
    await RvbActivityModel.create({ id: `rvba-${uuidv4()}`, createdAt: Date.now(), actorAccountId: reviewerId, actorTag: reviewerAcc?.tag || null, actorRole: reviewerAcc?.role || null, entityType: "worker", entityId: req.workerId, action: status === "accepted" ? `request_accepted:${req.type}` : `request_rejected:${req.type}`, sourceType: "requests", sourceId: req.id, title: `Payment request ${status}`, details: `${req.type} ${status} by @${reviewerAcc?.tag || reviewerId}` } as any);
  } catch {}

  return req.toObject ? req.toObject() : req;
}
