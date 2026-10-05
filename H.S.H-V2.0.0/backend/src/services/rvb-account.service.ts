import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { RvbAccountModel } from "../models/rvb-account.model";
import { RvbSessionModel } from "../models/rvb-session.model";
import { RvbNotificationRecipientModel } from "../models/rvb-notification-recipient.model";
import { RvbChatReminderModel } from "../models/rvb-chat-reminder.model";
import { WorkerModel } from "../models/worker.model";
import { SupplierModel } from "../models/supplier.model";
import { CustomerModel } from "../models/customer.model";
import { isValidRvbRole, isPortalRole } from "../constants/rvb-roles";
import { normalizeTag, isValidTag } from "../constants/rvb-account";
import { hashPassword, validatePasswordPolicy } from "../lib/password";

function safeDisconnectAccount(accountId: string) {
  try {
    const { disconnectRvbAccount } = require("../lib/chat-socket");
    if (typeof disconnectRvbAccount === "function") disconnectRvbAccount(accountId);
  } catch {}
}

export type CreateRvbAccountInput = {
  tag: string;
  displayName: string;
  role: string;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
  onboardingStatus?: string;
  profilePicture?: string;
  password?: string;
  confirmPassword?: string;
};

export type UpdateRvbAccountInput = {
  displayName?: string;
  profilePicture?: string;
};

const PATCH_ALLOWLIST = new Set(["displayName", "profilePicture"]);

function codeError(code: string, status: number, message?: string) {
  const err = new Error(message || code) as any;
  err.code = code;
  err.status = status;
  return err;
}

function validateRole(role: string) {
  // Canonical roles only. The retired "admin" role is rejected for all new
  // accounts (existing admin documents are migrated in-place to manager).
  if (role === "admin" || !isValidRvbRole(role)) {
    throw codeError("RVB_ROLE_INVALID", 400);
  }
}

function validateTag(raw: string): string {
  const tag = normalizeTag(raw);
  if (!tag) throw codeError("RVB_TAG_REQUIRED", 400);
  if (!isValidTag(tag)) throw codeError("RVB_TAG_INVALID", 400);
  return tag;
}

function isPortalRoleRole(role: string): boolean {
  return role === "worker" || role === "supplier" || role === "customer";
}

function isWorkerLinkableRole(role: string): boolean {
  return role === "worker" || role === "supervisor";
}

function validateLinkCompatibility(role: string, entityType: string): boolean {
  if (role === entityType) return true;
  if (role === "supervisor" && entityType === "worker") return true;
  return false;
}

function isTransactionsUnsupported(err: any): boolean {
  const msg = String(err?.message || "") + String(err?.code || "");
  return /transaction numbers|retryable writes|replica set|replset|IllegalOperation/i.test(msg) || err?.code === 20;
}

function isDuplicateKeyError(err: any): boolean {
  return err && (err.code === 11000 || err.code === "11000" || (err.message && String(err.message).includes("E11000")) || (err.name === "MongoServerError" && String(err.message).includes("duplicate")));
}

function mapDuplicateKeyError(err: any): any {
  if (!isDuplicateKeyError(err)) return null;
  const msg = String(err.message || "") + String(err.keyValue ? JSON.stringify(err.keyValue) : "") + String(err.keyPattern ? JSON.stringify(err.keyPattern) : "");
  if (msg.includes("tag") || msg.includes("tag_1")) return codeError("RVB_TAG_ALREADY_EXISTS", 409);
  if (msg.includes("linkedEntityType") || msg.includes("linkedEntityId") || msg.includes("linkedEntity")) return codeError("RVB_ENTITY_ALREADY_LINKED", 409);
  // Default to tag if unclear but duplicate
  return codeError("RVB_TAG_ALREADY_EXISTS", 409);
}

async function assertLinkedEntityExists(type: string, id: string) {
  let model: any = null;
  if (type === "worker") model = WorkerModel;
  else if (type === "supplier") model = SupplierModel;
  else if (type === "customer") model = CustomerModel;
  else throw codeError("RVB_ENTITY_ROLE_MISMATCH", 400);
  const doc = await (model as any).findOne({ id }).lean();
  if (!doc) throw codeError("RVB_LINKED_ENTITY_NOT_FOUND", 404);
  if (type === "worker" && doc.status !== "active") throw codeError("RVB_LINKED_ENTITY_INACTIVE", 409);
  return doc;
}

export async function createRvbAccount(input: CreateRvbAccountInput) {
  const rawTag = input.tag;
  const tag = validateTag(rawTag || "");
  validateRole(input.role);
  const role = input.role;

  const displayName = (input.displayName || "").trim();
  if (!displayName) throw codeError("RVB_DISPLAY_NAME_REQUIRED", 400);

  const linkedEntityType = input.linkedEntityType ? String(input.linkedEntityType).trim().toLowerCase() : null;
  const linkedEntityId = input.linkedEntityId ? String(input.linkedEntityId).trim() : null;

  const isSupervisor = role === "supervisor";
  const needsLink = isPortalRoleRole(role);
  // Supervisor may optionally link to a worker entity
  if (needsLink) {
    if (!linkedEntityType || !linkedEntityId) {
      throw codeError("RVB_LINKED_ENTITY_REQUIRED", 400);
    }
    if (!validateLinkCompatibility(role, linkedEntityType)) {
      throw codeError("RVB_ENTITY_ROLE_MISMATCH", 400);
    }
    await assertLinkedEntityExists(linkedEntityType, linkedEntityId);
    const existingLink = await (RvbAccountModel as any).findOne({
      linkedEntityType,
      linkedEntityId,
    }).lean();
    if (existingLink) throw codeError("RVB_ENTITY_ALREADY_LINKED", 409);
  } else if (isSupervisor) {
    // Supervisor: linkage optional, but if provided must be worker
    if (linkedEntityType || linkedEntityId) {
      if (!linkedEntityType || !linkedEntityId) throw codeError("RVB_LINKED_ENTITY_REQUIRED", 400);
      if (!validateLinkCompatibility(role, linkedEntityType)) throw codeError("RVB_ENTITY_ROLE_MISMATCH", 400);
      await assertLinkedEntityExists(linkedEntityType, linkedEntityId);
      const existingLink = await (RvbAccountModel as any).findOne({
        linkedEntityType,
        linkedEntityId,
      }).lean();
      if (existingLink) throw codeError("RVB_ENTITY_ALREADY_LINKED", 409);
    }
  } else {
    // manager: must not have linkage
    if (linkedEntityType || linkedEntityId) {
      if (linkedEntityType && linkedEntityId) {
        if (isPortalRoleRole(linkedEntityType)) {
          throw codeError("RVB_ENTITY_ROLE_MISMATCH", 400);
        }
      }
      throw codeError("RVB_ENTITY_ROLE_MISMATCH", 400);
    }
  }

  const existingTag = await RvbAccountModel.findOne({ tag }).lean();
  if (existingTag) throw codeError("RVB_TAG_ALREADY_EXISTS", 409);

  // Password handling
  let passwordHash: string | null = null;
  let mustChangePassword = false;
  if (input.password !== undefined || input.confirmPassword !== undefined) {
    const pwd = input.password || "";
    const confirm = input.confirmPassword;
    const policyError = validatePasswordPolicy(pwd, confirm);
    if (policyError) throw codeError(policyError, 400);
    passwordHash = await hashPassword(pwd);
    mustChangePassword = true;
  } else {
    // Allow creation without password (legacy phase accounts) — but new auth expects password
    // For new creates via protected route, we will require password at route level for clarity
    // Keep null for now if not provided
    passwordHash = null;
    mustChangePassword = false;
  }

  const now = Date.now();
  // Persist supervisor optional worker linkage (needsLink is false for supervisor)
  let finalLinkedType: string | null = null;
  let finalLinkedId: string | null = null;
  if (needsLink) {
    finalLinkedType = linkedEntityType as string;
    finalLinkedId = linkedEntityId as string;
  } else if (isSupervisor && linkedEntityType && linkedEntityId) {
    finalLinkedType = linkedEntityType as string;
    finalLinkedId = linkedEntityId as string;
  }
  const doc: any = {
    id: `rvbacc-${uuidv4()}`,
    createdAt: now,
    updatedAt: now,
    syncStatus: "synced",
    tag,
    displayName,
    role,
    linkedEntityType: finalLinkedType,
    linkedEntityId: finalLinkedId,
    status: "active",
    onboardingStatus: input.onboardingStatus === "complete" ? "complete" : "pending",
    profilePicture: input.profilePicture || undefined,
    archivedAt: null,
    linkedEntityLifecyclePriorStatus: null,
    lastLoginAt: null,
    passwordHash,
    mustChangePassword,
    passwordChangedAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
  };
  try {
    const created = await RvbAccountModel.create(doc);
    return created.toObject ? created.toObject() : created;
  } catch (err: any) {
    const mapped = mapDuplicateKeyError(err);
    if (mapped) throw mapped;
    throw err;
  }
}

export async function updateRvbAccount(id: string, input: any) {
  // Tag immutability check — must reject if tag present at all
  if (input && typeof input === "object" && "tag" in input) {
    throw codeError("RVB_TAG_IMMUTABLE", 400);
  }
  // Allowlist enforcement
  const forbiddenKeys = Object.keys(input || {}).filter((k) => !PATCH_ALLOWLIST.has(k));
  if (forbiddenKeys.length > 0) {
    // Provide specific error for known protected fields, generic otherwise
    const hasProtected = forbiddenKeys.some((k) =>
      ["id","linkedEntityType","linkedEntityId","status","onboardingStatus","passwordHash","archivedAt","createdAt","updatedAt","lastLoginAt","failedLoginAttempts","lockedUntil","mustChangePassword","passwordChangedAt","refresh","session"].includes(k)
    );
    if (hasProtected) throw codeError("RVB_FIELD_NOT_ALLOWED", 400);
    throw codeError("RVB_FIELD_NOT_ALLOWED", 400);
  }

  const account: any = await RvbAccountModel.findOne({ id });
  if (!account) throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);

  if (input.displayName !== undefined) {
    const name = String(input.displayName).trim();
    if (!name) throw codeError("RVB_DISPLAY_NAME_REQUIRED", 400);
    account.displayName = name;
  }
  if (input.profilePicture !== undefined) {
    account.profilePicture = input.profilePicture ? String(input.profilePicture) : undefined;
  }
  account.updatedAt = Date.now();
  await account.save();
  return account.toObject ? account.toObject() : account;
}

export async function archiveRvbAccount(id: string) {
  const account: any = await RvbAccountModel.findOne({ id });
  if (!account) throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);
  account.status = "archived";
  account.archivedAt = Date.now();
  account.linkedEntityLifecyclePriorStatus = null;
  account.updatedAt = Date.now();
  await account.save();
  safeDisconnectAccount(account.id);
  return account.toObject ? account.toObject() : account;
}

export async function reactivateRvbAccount(id: string) {
  const account: any = await RvbAccountModel.findOne({ id });
  if (!account) throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);
  if (account.linkedEntityType && account.linkedEntityId) {
    await assertLinkedEntityExists(account.linkedEntityType, account.linkedEntityId);
  }
  account.status = "active";
  account.archivedAt = null;
  account.linkedEntityLifecyclePriorStatus = null;
  account.updatedAt = Date.now();
  await account.save();
  safeDisconnectAccount(account.id);
  return account.toObject ? account.toObject() : account;
}

export async function disableRvbAccount(id: string) {
  const account: any = await RvbAccountModel.findOne({ id });
  if (!account) throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);
  account.status = "disabled";
  account.linkedEntityLifecyclePriorStatus = null;
  account.updatedAt = Date.now();
  await account.save();
  safeDisconnectAccount(account.id);
  return account.toObject ? account.toObject() : account;
}

/**
 * Permanently delete an RVB login identity. Removes ONLY account-scoped data:
 * - the account document itself
 * - its persisted sessions/refresh records (existing tokens become unusable;
 *   requireRvbAuth and socket auth already 401 unknown accounts/sessions)
 * - its notification-inbox rows and chat-reminder timers (per-account state)
 *
 * Explicitly preserved: linked Worker/Supplier/Customer records, all business
 * history (sales, purchases, payments, requests, activities, audits), chat
 * conversations and messages (sender rendering falls back downstream), and the
 * tag namespace itself (unique index on live accounts only, so the tag becomes
 * reusable — no historical reservation table exists).
 */
export async function deleteRvbAccount(id: string, actorAccountId?: string) {
  const account: any = await RvbAccountModel.findOne({ id });
  if (!account) throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);

  // Self-delete protection: a logged-in account can never delete itself here.
  if (actorAccountId && account.id === actorAccountId) {
    throw codeError("RVB_CANNOT_DELETE_SELF", 403);
  }

  // Last-management-account protection: deleting the final usable
  // manager would lock administration out. Backend-enforced (frontend
  // also hides, but this is the authority). Archived/disabled targets are
  // already unusable, so they never trip this guard.
  if (account.status === "active" && account.role === "manager") {
    const remaining = await RvbAccountModel.countDocuments({
      status: "active",
      role: "manager",
      id: { $ne: account.id },
    });
    if (remaining === 0) throw codeError("RVB_LAST_MANAGER", 409);
  }

  const tag = account.tag;
  // Atomic transaction where supported (production replica sets); ordered
  // fallback otherwise (account first so a partial failure can never leave a
  // deleted-account-with-live-access state — orphan session rows without an
  // account document are rejected by auth middleware regardless).
  const runDependentDeletes = async (session: any) => {
    const withSession = (q: any) => (session ? q.session(session) : q);
    await withSession(RvbAccountModel.deleteOne({ id: account.id }));
    await withSession(RvbSessionModel.deleteMany({ accountId: account.id }));
    await withSession(RvbNotificationRecipientModel.deleteMany({ accountId: account.id }));
    await withSession(RvbChatReminderModel.deleteMany({ recipientAccountId: account.id }));
  };
  let session: any = null;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(() => runDependentDeletes(session));
  } catch (e: any) {
    if (!isTransactionsUnsupported(e)) throw e;
    await runDependentDeletes(null);
  } finally {
    try { await session?.endSession(); } catch {}
  }
  // Kick live sockets; even without this, auth middleware rejects unknown
  // accounts and deleted sessions on the next request/handshake.
  safeDisconnectAccount(account.id);
  return { id: account.id, tag };
}

export async function setInitialPassword(accountId: string, password: string, confirmPassword: string) {
  const account: any = await RvbAccountModel.findOne({ id: accountId });
  if (!account) throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);
  if (account.passwordHash) throw codeError("RVB_PASSWORD_ALREADY_SET", 400);
  const policyError = validatePasswordPolicy(password, confirmPassword);
  if (policyError) throw codeError(policyError, 400);
  account.passwordHash = await hashPassword(password);
  account.mustChangePassword = true;
  account.passwordChangedAt = Date.now();
  account.updatedAt = Date.now();
  await account.save();
  return account.toObject ? account.toObject() : account;
}

// Worker/Supplier linking helpers
export async function linkRvbAccount(accountId: string, entityId: string) {
  const account: any = await RvbAccountModel.findOne({ id: accountId });
  if (!account) throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);
  if (account.linkedEntityType || account.linkedEntityId) throw codeError("RVB_ENTITY_ALREADY_LINKED", 409);
  if (account.status !== "active") throw codeError("RVB_ACCOUNT_NOT_FOUND", 400);

  let entityType: string | null = null;
  let entityExists = false;
  if (account.role === "worker" || account.role === "supervisor") {
    if (!isWorkerLinkableRole(account.role)) throw codeError("RVB_ENTITY_ROLE_MISMATCH", 400);
    const worker = await WorkerModel.findOne({ id: entityId }).lean();
    entityExists = !!worker;
    entityType = "worker";
    if (!worker) throw codeError("RVB_LINKED_ENTITY_NOT_FOUND", 404);
    if ((worker as any).status !== "active") throw codeError("RVB_LINKED_ENTITY_INACTIVE", 409);
    const existingLink = await (RvbAccountModel as any).findOne({ linkedEntityType: "worker", linkedEntityId: entityId }).lean();
    if (existingLink) throw codeError("RVB_ENTITY_ALREADY_LINKED", 409);
  } else if (account.role === "supplier") {
    const supplier = await SupplierModel.findOne({ id: entityId }).lean();
    entityExists = !!supplier;
    entityType = "supplier";
    if (!supplier) throw codeError("RVB_LINKED_ENTITY_NOT_FOUND", 404);
    const existingLink = await (RvbAccountModel as any).findOne({ linkedEntityType: "supplier", linkedEntityId: entityId }).lean();
    if (existingLink) throw codeError("RVB_ENTITY_ALREADY_LINKED", 409);
  } else if (account.role === "customer") {
    const customer = await CustomerModel.findOne({ id: entityId }).lean();
    entityExists = !!customer;
    entityType = "customer";
    if (!customer) throw codeError("RVB_LINKED_ENTITY_NOT_FOUND", 404);
    const existingLink = await (RvbAccountModel as any).findOne({ linkedEntityType: "customer", linkedEntityId: entityId }).lean();
    if (existingLink) throw codeError("RVB_ENTITY_ALREADY_LINKED", 409);
  } else {
    throw codeError("RVB_ENTITY_ROLE_MISMATCH", 400);
  }

  if (!entityType || !entityExists) throw codeError("RVB_LINKED_ENTITY_NOT_FOUND", 404);
  account.linkedEntityType = entityType;
  account.linkedEntityId = entityId;
  account.updatedAt = Date.now();
  try {
    await account.save();
  } catch (err: any) {
    const mapped = mapDuplicateKeyError(err);
    if (mapped) throw mapped;
    throw err;
  }
  // Only write WorkerActivity when linkedEntityType==="worker" and event genuinely belongs to Worker history.
  // For other types use RvbActivity/recordActivity.
  if (entityType === "worker") {
    try {
      const { WorkerActivityModel } = await import("../models/worker-activity.model");
      await WorkerActivityModel.create({
        id: `wka-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
        workerId: entityId,
        accountId: account.id,
        action: "account_linked",
        details: `Linked @${account.tag} (${account.role})`,
        actorId: null,
        actorTag: null,
      } as any);
    } catch {}
  } else {
    try {
      const { RvbActivityModel } = await import("../models/rvb-activity.model");
      const { v4: uuidv4 } = await import("uuid");
      const sourceType = entityType === "supplier" ? "suppliers" : entityType === "customer" ? "customers" : "system";
      await RvbActivityModel.create({
        id: `rvba-${uuidv4()}`,
        createdAt: Date.now(),
        actorAccountId: account.id,
        actorTag: account.tag,
        actorRole: account.role,
        entityType,
        entityId,
        action: "account_linked",
        sourceType: sourceType as any,
        sourceId: account.id,
        title: "Account linked",
        details: `Linked @${account.tag} (${account.role}) to ${entityType} ${entityId}`,
      } as any);
    } catch {}
  }
  return account.toObject ? account.toObject() : account;
}

export async function unlinkRvbAccount(accountId: string) {
  const account: any = await RvbAccountModel.findOne({ id: accountId });
  if (!account) throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);
  if (!account.linkedEntityType || !account.linkedEntityId) throw codeError("RVB_LINKED_ENTITY_NOT_FOUND", 404);
  const previousRole = account.role;
  const entityId = account.linkedEntityId;
  const entityType = account.linkedEntityType;
  // Allow unlink for worker/supplier/customer
  if (!["worker", "supplier", "customer"].includes(entityType)) throw codeError("RVB_ENTITY_ROLE_MISMATCH", 400);
  account.linkedEntityType = null;
  account.linkedEntityId = null;
  account.linkedEntityLifecyclePriorStatus = null;
  account.updatedAt = Date.now();
  // Security: orphan portal account must not remain active
  if (previousRole === "worker" || previousRole === "supplier" || previousRole === "customer") {
    account.status = "disabled";
    account.archivedAt = null;
  }
  // Supervisor retains management access even without worker link — keep status as is (handled above: supervisor not in list)
  await account.save();
  if (account.status === "disabled" || account.status === "archived") safeDisconnectAccount(account.id);
  if (entityType === "worker") {
    try {
      const { WorkerActivityModel } = await import("../models/worker-activity.model");
      await WorkerActivityModel.create({
        id: `wka-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
        workerId: entityId,
        accountId: account.id,
        action: "account_unlinked",
        details: `Unlinked @${account.tag} (${previousRole})`,
        actorId: null,
        actorTag: null,
      } as any);
    } catch {}
  } else {
    try {
      const { RvbActivityModel } = await import("../models/rvb-activity.model");
      const { v4: uuidv4 } = await import("uuid");
      const sourceType = entityType === "supplier" ? "suppliers" : entityType === "customer" ? "customers" : "system";
      await RvbActivityModel.create({
        id: `rvba-${uuidv4()}`,
        createdAt: Date.now(),
        actorAccountId: account.id,
        actorTag: account.tag,
        actorRole: previousRole,
        entityType,
        entityId,
        action: "account_unlinked",
        sourceType: sourceType as any,
        sourceId: account.id,
        title: "Account unlinked",
        details: `Unlinked @${account.tag} (${previousRole}) from ${entityType} ${entityId}`,
      } as any);
    } catch {}
  }
  return account.toObject ? account.toObject() : account;
}

export type LinkedEntityLifecycleAction = "archive" | "restore" | "delete";

/**
 * Mirror H.S.H-owned entity lifecycle transitions onto the linked portal account.
 * The optional Mongo session lets H.S.H sync commit the entity and access state atomically.
 */
export async function applyLinkedEntityLifecycleToRvbAccount(
  type: string,
  entityId: string,
  action: LinkedEntityLifecycleAction,
  session?: any,
): Promise<string | null> {
  if (!["worker", "supplier", "customer"].includes(type)) return null;
  const query: any = (RvbAccountModel as any).findOne({ linkedEntityType: type, linkedEntityId: entityId });
  if (session) query.session(session);
  const account: any = await query;
  if (!account) return null;

  const now = Date.now();
  let changed = false;
  let disconnect = false;

  if (action === "archive") {
    if (account.linkedEntityLifecyclePriorStatus == null) {
      account.linkedEntityLifecyclePriorStatus = account.status;
      changed = true;
    }
    if (account.status === "active") {
      account.status = "archived";
      account.archivedAt = now;
      disconnect = true;
      changed = true;
    }
  } else if (action === "restore") {
    if (account.linkedEntityLifecyclePriorStatus === "active" && account.status === "archived") {
      account.status = "active";
      account.archivedAt = null;
      disconnect = true;
      changed = true;
    }
    if (account.linkedEntityLifecyclePriorStatus != null) {
      account.linkedEntityLifecyclePriorStatus = null;
      changed = true;
    }
  } else {
    if (account.status !== "disabled") {
      account.status = "disabled";
      account.archivedAt = null;
      disconnect = true;
      changed = true;
    }
    if (account.linkedEntityLifecyclePriorStatus != null) {
      account.linkedEntityLifecyclePriorStatus = null;
      changed = true;
    }
  }

  if (!changed) return null;
  account.updatedAt = now;
  if (session) await account.save({ session });
  else await account.save();

  if (!session && disconnect) safeDisconnectAccount(account.id);
  return disconnect ? account.id : null;
}

// Worker lifecycle: archive/reactivate with state preservation
export async function archiveByLinkedEntity(type: string, entityId: string) {
  const account: any = await (RvbAccountModel as any).findOne({ linkedEntityType: type, linkedEntityId: entityId });
  if (!account) return null;
  // Only archive if currently active — preserve already disabled/archived intentional state
  if (account.status !== "active") return account;
  account.linkedEntityLifecyclePriorStatus = "active";
  account.status = "archived";
  account.archivedAt = Date.now();
  account.updatedAt = Date.now();
  await account.save();
  safeDisconnectAccount(account.id);
  if (type === "worker") {
    try {
      const { WorkerActivityModel } = await import("../models/worker-activity.model");
      await WorkerActivityModel.create({
        id: `wka-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
        workerId: entityId,
        accountId: account.id,
        action: "account_archived_via_worker",
        details: `Archived via worker archive`,
        actorId: null,
        actorTag: null,
      } as any);
    } catch {}
  } else {
    try {
      const { RvbActivityModel } = await import("../models/rvb-activity.model");
      const { v4: uuidv4 } = await import("uuid");
      const sourceType = type === "supplier" ? "suppliers" : type === "customer" ? "customers" : "system";
      const entityTypeForActivity = type as string;
      await RvbActivityModel.create({
        id: `rvba-${uuidv4()}`,
        createdAt: Date.now(),
        actorAccountId: account.id,
        actorTag: account.tag,
        actorRole: account.role,
        entityType: entityTypeForActivity,
        entityId,
        action: "account_archived_via_entity",
        sourceType: sourceType as any,
        sourceId: entityId,
        title: "Account archived via entity",
        details: `Archived via ${type} archive`,
      } as any);
    } catch {}
  }
  return account;
}
export async function reactivateByLinkedEntity(type: string, entityId: string) {
  const account: any = await (RvbAccountModel as any).findOne({ linkedEntityType: type, linkedEntityId: entityId });
  if (!account) return null;
  // Only reactivate if was archived (not disabled intentionally)
  if (account.status !== "archived") return account;
  if (account.linkedEntityLifecyclePriorStatus && account.linkedEntityLifecyclePriorStatus !== "active") return account;
  account.status = "active";
  account.archivedAt = null;
  account.linkedEntityLifecyclePriorStatus = null;
  account.updatedAt = Date.now();
  await account.save();
  safeDisconnectAccount(account.id);
  if (type === "worker") {
    try {
      const { WorkerActivityModel } = await import("../models/worker-activity.model");
      await WorkerActivityModel.create({
        id: `wka-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
        workerId: entityId,
        accountId: account.id,
        action: "account_reactivated_via_worker",
        details: `Reactivated via worker restore`,
        actorId: null,
        actorTag: null,
      } as any);
    } catch {}
  } else {
    try {
      const { RvbActivityModel } = await import("../models/rvb-activity.model");
      const { v4: uuidv4 } = await import("uuid");
      const sourceType = type === "supplier" ? "suppliers" : type === "customer" ? "customers" : "system";
      const entityTypeForActivity = type as string;
      await RvbActivityModel.create({
        id: `rvba-${uuidv4()}`,
        createdAt: Date.now(),
        actorAccountId: account.id,
        actorTag: account.tag,
        actorRole: account.role,
        entityType: entityTypeForActivity,
        entityId,
        action: "account_reactivated_via_entity",
        sourceType: sourceType as any,
        sourceId: entityId,
        title: "Account reactivated via entity",
        details: `Reactivated via ${type} restore`,
      } as any);
    } catch {}
  }
  return account;
}
