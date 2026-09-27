"use client";

import { rvbAuthService } from "./rvb-auth.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/chats`;

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

export type Conversation = {
  id: string;
  category: "main" | "secondary";
  type: "official_group" | "official_private" | "dm" | "group";
  officialKind?: string | null;
  name?: string | null;
  avatar?: string | null;
  createdBy?: string | null;
  participants: Array<{ accountId: string; role: string; joinedAt: number; account?: any }>;
  isSystemManaged: boolean;
  lastMessageAt?: number | null;
  lastMessagePreview?: string | null;
  lastMessageSenderId?: string | null;
  pinnedMessages?: Array<{ messageId: string; pinnedBy: string; pinnedAt: number }>;
  unreadCount?: number;
  updatedAt: number;
  createdAt: number;
  isArchived?: boolean;
};

export type Message = {
  id: string;
  conversationId: string;
  senderAccountId: string;
  content: string;
  replyToMessageId?: string | null;
  createdAt: number;
  editedAt?: number | null;
  deletedAt?: number | null;
  isDeleted?: boolean;
  editHistory?: Array<{ content: string; editedAt: number }>;
  reactions?: Array<{ accountId: string; emoji: string; createdAt: number }>;
  readBy?: Array<{ accountId: string; readAt: number }>;
  mentions?: string[];
  sender?: any;
};

export const chatService = {
  async list(category?: string, search?: string): Promise<Conversation[]> {
    const qs = new URLSearchParams();
    if (category && category !== "all") qs.set("category", category);
    if (search) qs.set("search", search);
    const url = qs.toString() ? `${BASE}?${qs.toString()}` : BASE;
    const res = await rvbAuthService.authFetch(url, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; conversations: Conversation[] }>(res);
    return data.conversations || [];
  },
  async get(id: string): Promise<Conversation> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; conversation: Conversation }>(res);
    return data.conversation;
  },
  async createDM(otherAccountId: string): Promise<Conversation> {
    const res = await rvbAuthService.authFetch(`${BASE}/dm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ otherAccountId }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; conversation: Conversation }>(res);
    return data.conversation;
  },
  async createGroup(input: { name: string; avatar?: string | null; memberIds: string[] }): Promise<Conversation> {
    const res = await rvbAuthService.authFetch(`${BASE}/group`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(input),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; conversation: Conversation }>(res);
    return data.conversation;
  },
  async leave(id: string): Promise<any> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}/leave`, { method: "POST", headers: { ...getAuthHeaders() }, credentials: "include" });
    return handleResponse(res);
  },
  async updateGroup(id: string, patch: { name?: string; avatar?: string | null; addMemberIds?: string[]; removeMemberIds?: string[] }): Promise<Conversation> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(patch),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; conversation: Conversation }>(res);
    return data.conversation;
  },
  async listMessages(conversationId: string, opts: { before?: number; limit?: number; search?: string } = {}): Promise<Message[]> {
    const qs = new URLSearchParams();
    if (opts.before) qs.set("before", String(opts.before));
    if (opts.limit) qs.set("limit", String(opts.limit));
    if (opts.search) qs.set("search", opts.search);
    const url = qs.toString() ? `${BASE}/${encodeURIComponent(conversationId)}/messages?${qs.toString()}` : `${BASE}/${encodeURIComponent(conversationId)}/messages`;
    const res = await rvbAuthService.authFetch(url, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; messages: Message[] }>(res);
    return data.messages || [];
  },
  async sendMessage(conversationId: string, content: string, replyToMessageId?: string | null, reminderMinutes?: number | null): Promise<Message> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ content, replyToMessageId, reminderMinutes }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; message: Message }>(res);
    return data.message;
  },
  async editMessage(messageId: string, content: string): Promise<Message> {
    const res = await rvbAuthService.authFetch(`${BASE}/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ content }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; message: Message }>(res);
    return data.message;
  },
  async deleteMessage(messageId: string): Promise<Message> {
    const res = await rvbAuthService.authFetch(`${BASE}/messages/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; message: Message }>(res);
    return data.message;
  },
  async getAudit(messageId: string): Promise<{ message: any; audits: any[] }> {
    const res = await rvbAuthService.authFetch(`${BASE}/messages/${encodeURIComponent(messageId)}/audit`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; message: any; audits: any[] }>(res);
    return { message: data.message, audits: data.audits };
  },
  async toggleReaction(messageId: string): Promise<Message> {
    const res = await rvbAuthService.authFetch(`${BASE}/messages/${encodeURIComponent(messageId)}/reaction`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; message: Message }>(res);
    return data.message;
  },
  async pin(conversationId: string, messageId: string): Promise<Conversation> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(conversationId)}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ messageId }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; conversation: Conversation }>(res);
    return data.conversation;
  },
  async unpin(conversationId: string, messageId: string): Promise<Conversation> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(conversationId)}/unpin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ messageId }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; conversation: Conversation }>(res);
    return data.conversation;
  },
  async markRead(conversationId: string, upToMessageId?: string): Promise<any> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(conversationId)}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ upToMessageId }),
      credentials: "include",
    });
    return handleResponse(res);
  },
  async getUnreadCounts(): Promise<Record<string, number>> {
    const res = await rvbAuthService.authFetch(`${BASE}/unread/counts`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; counts: Record<string, number> }>(res);
    return data.counts || {};
  },
  async getUnreadTotal(): Promise<number> {
    const counts = await chatService.getUnreadCounts();
    return Object.values(counts).reduce((acc: number, v: any) => acc + (Number(v) || 0), 0);
  },
};
