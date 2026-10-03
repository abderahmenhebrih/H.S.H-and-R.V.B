import { api } from "@/api/client";

export async function searchDirectory(params?: { search?: string; role?: string; page?: number; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.role) q.set("role", params.role);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : "";
  const res = await api.get<{ success: boolean; items?: any[]; users?: any[]; directory?: any[]; results?: any[] }>(`/api/rvb/directory${qs}`);
  // Backend canonical shape returns `items`; keep legacy fallbacks behind it
  return (res as any).items || (res as any).users || (res as any).directory || (res as any).results || [];
}
