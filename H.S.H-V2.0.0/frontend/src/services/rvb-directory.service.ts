"use client";
import { rvbAuthService } from "./rvb-auth.service";
import type { RvbAccount } from "../types/rvb/rvb-account";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/directory`;

function getAuthHeaders(): Record<string, string> {
  const token = rvbAuthService.getAccessToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}
async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.code || data?.message || `Request failed ${res.status}`);
    err.code = data?.code;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export type DirectoryItem = Pick<RvbAccount, "id" | "displayName" | "tag" | "role" | "status" | "profilePicture" | "linkedEntityType" | "linkedEntityId"> & { createdAt: number; updatedAt: number };
export type DirectoryListResponse = { success: boolean; items: DirectoryItem[]; total: number; page: number; limit: number; totalPages: number };
export type DirectoryProfile = DirectoryItem;

export const rvbDirectoryService = {
  async list(params: { q?: string; role?: string; page?: number; limit?: number } = {}): Promise<DirectoryListResponse> {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.role) qs.set("role", params.role);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const url = qs.toString() ? `${BASE}?${qs.toString()}` : BASE;
    const res = await rvbAuthService.authFetch(url, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    return handleResponse<DirectoryListResponse>(res);
  },
  async getProfile(accountId: string): Promise<DirectoryProfile> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(accountId)}`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; account: DirectoryProfile }>(res);
    return data.account;
  },
};
