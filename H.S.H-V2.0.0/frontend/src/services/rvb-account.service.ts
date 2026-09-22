"use client";

import type { RvbAccount } from "../types/rvb/rvb-account";
import { rvbAuthService } from "./rvb-auth.service";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:5000";

const ACCOUNTS_BASE = `${API_BASE}/api/rvb/accounts`;

function getAuthHeaders(): Record<string, string> {
  const token = rvbAuthService.getAccessToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.code || data?.message || `Request failed ${res.status}`);
    err.code = data?.code || data?.code === undefined ? data?.code : undefined;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export type CreateRvbAccountPayload = {
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

export const rvbAccountService = {
  async getAll(): Promise<RvbAccount[]> {
    const res = await fetch(ACCOUNTS_BASE, { method: "GET", cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; accounts: RvbAccount[] }>(res);
    return data.accounts || [];
  },

  async getById(id: string): Promise<RvbAccount> {
    const res = await fetch(`${ACCOUNTS_BASE}/${encodeURIComponent(id)}`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; account: RvbAccount }>(res);
    return data.account;
  },

  async create(payload: CreateRvbAccountPayload): Promise<RvbAccount> {
    const res = await fetch(ACCOUNTS_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; account: RvbAccount }>(res);
    return data.account;
  },

  async update(id: string, payload: Partial<CreateRvbAccountPayload>): Promise<RvbAccount> {
    const res = await fetch(`${ACCOUNTS_BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; account: RvbAccount }>(res);
    return data.account;
  },

  async archive(id: string): Promise<RvbAccount> {
    const res = await fetch(`${ACCOUNTS_BASE}/${encodeURIComponent(id)}/archive`, { method: "POST", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; account: RvbAccount }>(res);
    return data.account;
  },

  async reactivate(id: string): Promise<RvbAccount> {
    const res = await fetch(`${ACCOUNTS_BASE}/${encodeURIComponent(id)}/reactivate`, { method: "POST", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; account: RvbAccount }>(res);
    return data.account;
  },

  async disable(id: string): Promise<RvbAccount> {
    const res = await fetch(`${ACCOUNTS_BASE}/${encodeURIComponent(id)}/disable`, { method: "POST", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; account: RvbAccount }>(res);
    return data.account;
  },

  async setInitialPassword(id: string, password: string, confirmPassword: string): Promise<RvbAccount> {
    const res = await fetch(`${ACCOUNTS_BASE}/${encodeURIComponent(id)}/set-initial-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ password, confirmPassword }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; account: RvbAccount }>(res);
    return data.account;
  },
};
