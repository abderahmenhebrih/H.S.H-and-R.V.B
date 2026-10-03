import { api } from "@/api/client";

export async function getNotifications(params?: { status?: string; source?: string; search?: string; page?: number; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.source) q.set("source", params.source);
  if (params?.search) q.set("search", params.search);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : "";
  const res = await api.get<any>(`/api/rvb/notifications${qs}`);
  return res;
}
export async function getUnreadCount() {
  const res = await api.get<any>(`/api/rvb/notifications/count`);
  return res.unreadCount as number;
}
export async function markRead(id: string, unread = false) {
  const res = await api.post<any>(`/api/rvb/notifications/${id}/read`, { unread });
  return res.notification;
}
export async function archiveNotification(id: string, archived = true) {
  const res = await api.post<any>(`/api/rvb/notifications/${id}/archive`, { archived });
  return res.notification;
}
export async function bulkUpdate(ids: string[], action: "read" | "unread" | "archive" | "restore") {
  const res = await api.post<any>(`/api/rvb/notifications/bulk`, { ids, action });
  return res;
}
