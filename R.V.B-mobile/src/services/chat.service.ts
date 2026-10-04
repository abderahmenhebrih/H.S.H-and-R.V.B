import { api, getAccessTokenMemory } from "@/api/client";
import { getApiBaseUrl } from "@/api/config";
import { RvbApiError } from "@/types/rvb";

export async function getConversations(category?: "main" | "secondary", search?: string) {
  const q = new URLSearchParams();
  if (category) q.set("category", category);
  if (search) q.set("search", search);
  const qs = q.toString() ? `?${q.toString()}` : "";
  const res = await api.get<{ success: boolean; conversations: any[] }>(`/api/rvb/chats${qs}`);
  return res.conversations || [];
}
export async function getConversation(id: string) {
  const res = await api.get<{ success: boolean; conversation: any }>(`/api/rvb/chats/${id}`);
  return res.conversation;
}
export async function createDM(otherAccountId: string) {
  const res = await api.post<{ success: boolean; conversation: any }>("/api/rvb/chats/dm", { otherAccountId });
  return res.conversation;
}
export async function createGroup(input: { name: string; memberIds: string[] }) {
  const res = await api.post<{ success: boolean; conversation: any }>("/api/rvb/chats/group", { name: input.name, memberIds: input.memberIds });
  return res.conversation;
}
export async function getMessages(conversationId: string, params?: { before?: number; limit?: number; search?: string }) {
  const q = new URLSearchParams();
  if (params?.before) q.set("before", String(params.before));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  const qs = q.toString() ? `?${q.toString()}` : "";
  const res = await api.get<{ success: boolean; messages: any[] }>(`/api/rvb/chats/${conversationId}/messages${qs}`);
  return res.messages || [];
}
// Production URL-based contract (shared with desktop). Messages carry ONLY
// attachment metadata + delivery URL; bytes travel once via multipart upload.
export type ChatAttachment = {
  id: string;
  kind: "image" | "video";
  url: string;
  publicId?: string | null;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
};

export async function sendMessage(conversationId: string, content: string, replyTo?: string | null, attachmentIds?: string[]) {
  const res = await api.post<{ success: boolean; message: any }>(`/api/rvb/chats/${conversationId}/messages`, {
    content,
    replyToMessageId: replyTo || null,
    ...(attachmentIds && attachmentIds.length ? { attachmentIds } : {}),
  });
  return res.message;
}

// Authenticated multipart upload. Sends the local file URI as binary
// (FormData) — never base64. Returns the trusted attachment record whose id
// is then referenced in sendMessage (reusable for immediate retry).
export async function uploadAttachment(
  conversationId: string,
  file: { uri: string; mimeType: string; name?: string },
): Promise<ChatAttachment> {
  const base = getApiBaseUrl();
  const token = getAccessTokenMemory();
  const form = new FormData();
  form.append("file", {
    uri: file.uri,
    type: file.mimeType,
    name: file.name || (file.mimeType.startsWith("video/") ? "video.mp4" : "image.jpg"),
  } as any);
  const headers: Record<string, string> = { "X-RVB-Client": "native" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // NOTE: no Content-Type header — fetch sets multipart boundary itself.
  const res = await fetch(`${base}/api/rvb/chats/${encodeURIComponent(conversationId)}/attachments`, {
    method: "POST",
    headers,
    body: form,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok || !json?.attachment) {
    throw new RvbApiError({
      status: res.status,
      code: json?.code || `HTTP_${res.status}`,
      message: json?.message || "Upload failed",
      data: json,
    });
  }
  return json.attachment as ChatAttachment;
}
export async function editMessage(messageId: string, content: string) {
  const res = await api.patch<{ success: boolean; message: any }>(`/api/rvb/chats/messages/${messageId}`, { content });
  return res.message;
}
export async function deleteMessage(messageId: string) {
  const res = await api.del<{ success: boolean; message: any }>(`/api/rvb/chats/messages/${messageId}`);
  return res.message;
}
export async function toggleReaction(messageId: string) {
  const res = await api.post<{ success: boolean; message: any }>(`/api/rvb/chats/messages/${messageId}/reaction`, {});
  return res.message;
}
export async function pinMessage(conversationId: string, messageId: string) {
  const res = await api.post<{ success: boolean; conversation: any }>(`/api/rvb/chats/${conversationId}/pin`, { messageId });
  return res.conversation;
}
export async function unpinMessage(conversationId: string, messageId: string) {
  const res = await api.post<{ success: boolean; conversation: any }>(`/api/rvb/chats/${conversationId}/unpin`, { messageId });
  return res.conversation;
}
export async function markRead(conversationId: string, upToMessageId?: string) {
  const res = await api.post<any>(`/api/rvb/chats/${conversationId}/read`, { upToMessageId });
  return res;
}
export async function leaveConversation(conversationId: string) {
  const res = await api.post<any>(`/api/rvb/chats/${conversationId}/leave`, {});
  return res;
}
