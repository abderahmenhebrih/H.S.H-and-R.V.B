import { api } from "@/api/client";

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
export async function sendMessage(conversationId: string, content: string, replyTo?: string | null) {
  const res = await api.post<{ success: boolean; message: any }>(`/api/rvb/chats/${conversationId}/messages`, { content, replyToMessageId: replyTo || null });
  return res.message;
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
