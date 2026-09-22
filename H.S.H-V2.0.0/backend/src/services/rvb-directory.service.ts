import { RvbAccountModel } from "../models/rvb-account.model";
import { toSafeRvbAccount } from "../lib/rvb-auth";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type DirectoryRoleFilter = "all" | "worker" | "supervisor" | "supplier" | "customer" | "management";

function buildRoleFilter(role: DirectoryRoleFilter): any {
  if (role === "all") return {};
  if (role === "worker") return { role: "worker" };
  if (role === "supervisor") return { role: "supervisor" };
  if (role === "supplier") return { role: "supplier" };
  if (role === "customer") return { role: "customer" };
  if (role === "management") return { role: { $in: ["manager", "admin", "supervisor"] } };
  return {};
}

export async function listDirectory(params: {
  q?: string;
  role?: DirectoryRoleFilter;
  page?: number;
  limit?: number;
}) {
  const q = (params.q || "").trim();
  const role = (params.role || "all") as DirectoryRoleFilter;
  const page = Math.max(1, Math.min(100, params.page || 1));
  const limit = Math.min(30, Math.max(1, params.limit || 24));
  const skip = (page - 1) * limit;

  const filter: any = { status: "active" };
  Object.assign(filter, buildRoleFilter(role));

  if (q) {
    const normalizedTag = q.startsWith("@") ? q.slice(1) : q;
    const escDisplay = escapeRegex(q);
    const escTag = escapeRegex(normalizedTag);
    // Search displayName, tag, role label
    // Use $or with regex case-insensitive
    const or: any[] = [
      { displayName: { $regex: escDisplay, $options: "i" } },
      { tag: { $regex: escTag, $options: "i" } },
    ];
    // role label search: if q matches role string, include via role regex
    const roleLabels = ["manager", "admin", "supervisor", "worker", "supplier", "customer"];
    const lower = q.toLowerCase().replace(/^@/, "");
    if (roleLabels.some((r) => r.includes(lower) || lower.includes(r))) {
      // already handled by broader but add explicit role regex
      or.push({ role: { $regex: escapeRegex(lower), $options: "i" } });
    }
    filter.$or = or;
  }

  const total = await RvbAccountModel.countDocuments(filter);
  const docs = await RvbAccountModel.find(filter)
    .sort({ displayName: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const items = docs.map((d: any) => toSafeRvbAccount(d));
  // Project only safe fields
  const safeItems = items.map((a: any) => ({
    id: a.id,
    displayName: a.displayName,
    tag: a.tag,
    role: a.role,
    status: a.status,
    profilePicture: a.profilePicture || null,
    linkedEntityType: a.linkedEntityType || null,
    linkedEntityId: a.linkedEntityId || null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));

  return {
    items: safeItems,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getDirectoryProfile(accountId: string) {
  const doc: any = await RvbAccountModel.findOne({ id: accountId, status: "active" }).lean();
  if (!doc) {
    const err: any = new Error("Account not found");
    err.code = "RVB_ACCOUNT_NOT_FOUND";
    err.status = 404;
    throw err;
  }
  const safe = toSafeRvbAccount(doc);
  return {
    id: safe.id,
    displayName: safe.displayName,
    tag: safe.tag,
    role: safe.role,
    status: safe.status,
    profilePicture: safe.profilePicture || null,
    linkedEntityType: safe.linkedEntityType || null,
    linkedEntityId: safe.linkedEntityId || null,
    createdAt: safe.createdAt,
  };
}
