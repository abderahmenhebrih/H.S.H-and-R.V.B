import { v4 as uuidv4 } from "uuid";
import { WorkerFinancialEventModel } from "../models/worker-financial-event.model";
import { WorkerActivityModel } from "../models/worker-activity.model";

export async function recordFinancialEvent(input: {
  workerId: string;
  type: "salary" | "bonus" | "absence" | "payment" | "loan" | "adjustment";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  note?: string | null;
  actorId?: string | null;
  actorTag?: string | null;
  referenceId?: string | null;
}) {
  const now = Date.now();
  const doc: any = {
    id: `wkfe-${uuidv4()}`,
    createdAt: now,
    updatedAt: now,
    workerId: input.workerId,
    type: input.type,
    amount: input.amount,
    balanceBefore: input.balanceBefore,
    balanceAfter: input.balanceAfter,
    note: input.note || null,
    actorId: input.actorId || null,
    actorTag: input.actorTag || null,
    referenceId: input.referenceId || null,
  };
  const created = await WorkerFinancialEventModel.create(doc);
  return created.toObject ? created.toObject() : created;
}

export async function listFinancialEvents(workerId: string) {
  return WorkerFinancialEventModel.find({ workerId }).sort({ createdAt: -1 }).lean();
}

export async function recordActivity(input: {
  workerId: string;
  action: string;
  details?: string | null;
  actorId?: string | null;
  actorTag?: string | null;
  referenceId?: string | null;
}) {
  const now = Date.now();
  const doc: any = {
    id: `wka-${uuidv4()}`,
    createdAt: now,
    workerId: input.workerId,
    accountId: input.actorId || null,
    action: input.action,
    details: input.details || null,
    actorId: input.actorId || null,
    actorTag: input.actorTag || null,
  };
  // Use WorkerActivityModel (has createdAt, workerId, etc.)
  // Map referenceId into details if needed
  const created = await WorkerActivityModel.create({
    ...doc,
    // WorkerActivity schema expects createdAt, workerId, accountId, action, details, actorId, actorTag
  } as any);
  return created;
}

export async function listActivities(workerId?: string) {
  const filter: any = {};
  if (workerId) filter.workerId = workerId;
  return WorkerActivityModel.find(filter).sort({ createdAt: -1 }).lean();
}
