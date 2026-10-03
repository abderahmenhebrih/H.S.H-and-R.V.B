import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, FlatList, StyleSheet, TextInput, Pressable, Alert, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/theme/useTheme";
import { useAuthStore } from "@/stores/auth-store";
import { getConversation, getMessages, sendMessage, editMessage, deleteMessage, toggleReaction, pinMessage, unpinMessage, markRead } from "@/services/chat.service";
import { getSocket } from "@/services/socket";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { isRTL } from "@/i18n";
import { formatDateTime } from "@/utils/date";

export default function ChatDetail() {
  const { theme } = useTheme();
  const rtl = isRTL();
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = String(id);
  const account = useAuthStore((s) => s.account);
  const [conv, setConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const flatRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const c = await getConversation(convId);
      setConv(c);
      const msgs = await getMessages(convId, { limit: 50 });
      setMessages(msgs.reverse());
      // Mark read
      const last = msgs[0];
      if (last) markRead(convId, last.id).catch(() => {});
    } catch (e: any) {
      setError(e?.message || "Failed to load conversation");
    } finally {
      setLoading(false);
    }
  }, [convId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onNew = (p: any) => {
      if (p.conversationId === convId) {
        setMessages((prev) => [...prev, p.message]);
        markRead(convId, p.message.id).catch(() => {});
      }
    };
    const onEdited = (p: any) => {
      setMessages((prev) => prev.map((m) => (m.id === p.message.id ? p.message : m)));
    };
    const onDeleted = (p: any) => {
      setMessages((prev) => prev.map((m) => (m.id === p.messageId ? { ...m, deletedAt: Date.now(), content: "Message deleted" } : m)));
    };
    const onReaction = (p: any) => {
      setMessages((prev) => prev.map((m) => (m.id === p.message.id ? p.message : m)));
    };
    const onPinned = (p: any) => {
      setConv(p.conversation);
    };
    const onTyping = (p: any) => {
      if (p.conversationId === convId && p.accountId !== account?.id) {
        setTyping(p.displayName || "Someone is typing");
        setTimeout(() => setTyping(null), 3000);
      }
    };
    s.on("chat:newMessage", onNew);
    s.on("chat:messageEdited", onEdited);
    s.on("chat:messageDeleted", onDeleted);
    s.on("chat:reactionUpdated", onReaction);
    s.on("chat:pinnedUpdated", onPinned);
    s.on("chat:typing", onTyping);
    return () => {
      s.off("chat:newMessage", onNew);
      s.off("chat:messageEdited", onEdited);
      s.off("chat:messageDeleted", onDeleted);
      s.off("chat:reactionUpdated", onReaction);
      s.off("chat:pinnedUpdated", onPinned);
      s.off("chat:typing", onTyping);
    };
  }, [convId, account?.id]);

  const handleSend = async () => {
    const text = composer.trim();
    if (!text) return;
    if (text.length > 2000) {
      Alert.alert("Too long", "Max 2000 characters");
      return;
    }
    setSending(true);
    try {
      const msg = await sendMessage(convId, text);
      setMessages((prev) => [...prev, msg]);
      setComposer("");
      flatRef.current?.scrollToEnd({ animated: true });
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const handleEdit = async (m: any) => {
    if (!editText.trim()) {
      Alert.alert("Invalid", "Content required");
      return;
    }
    const elapsed = Date.now() - (m.createdAt || 0);
    if (elapsed > 15 * 60 * 1000) {
      Alert.alert("Expired", "Edit window is 15 minutes");
      return;
    }
    try {
      const updated = await editMessage(m.id, editText.trim());
      setMessages((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
      setEditingId(null);
      setEditText("");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Edit failed");
    }
  };

  const handleDelete = async (m: any) => {
    Alert.alert("Delete message", "Delete this message?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMessage(m.id);
            setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deletedAt: Date.now(), content: "Message deleted" } : x)));
          } catch (e: any) {
            Alert.alert("Failed", e?.message || "Delete failed");
          }
        },
      },
    ]);
  };

  const handleReaction = async (m: any) => {
    try {
      const updated = await toggleReaction(m.id);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Reaction failed");
    }
  };

  const handlePin = async (m: any) => {
    const isPinned = conv?.pinnedMessages?.some((p: any) => p.messageId === m.id);
    try {
      if (isPinned) await unpinMessage(convId, m.id);
      else await pinMessage(convId, m.id);
      const c = await getConversation(convId);
      setConv(c);
    } catch (e: any) {
      Alert.alert("Failed", e?.message || (isPinned ? "Unpin failed" : "Pin failed (max 3?)"));
    }
  };

  const canEdit = (m: any) => {
    if (m.senderId !== account?.id && m.accountId !== account?.id) return false;
    if (m.deletedAt) return false;
    const elapsed = Date.now() - (m.createdAt || 0);
    return elapsed <= 15 * 60 * 1000;
  };

  if (loading) return <Loading message="Loading conversation..." />;
  if (error) return <ErrorState title="Could not load chat" message={error} onRetry={load} />;

  const pinned = conv?.pinnedMessages || [];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
          {conv?.name || conv?.participants?.map((p: any) => p.account?.displayName).join(", ") || "Chat"}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>{conv?.participants?.length || 0} members {pinned.length ? `• ${pinned.length}/3 pinned` : ""}</Text>
      </View>
      {pinned.length > 0 ? (
        <View style={[styles.pinnedSection, { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warning }]}>
          <Text style={[styles.pinnedTitle, { color: theme.colors.warning }]}>Pinned ({pinned.length}/3)</Text>
          {pinned.map((p: any) => {
            const msg = messages.find((m) => m.id === p.messageId);
            return (
              <View key={p.messageId} style={styles.pinnedRow}>
                <Text style={[styles.pinnedText, { color: theme.colors.text }]} numberOfLines={1}>
                  {msg?.content || p.messageId}
                </Text>
                <Pressable onPress={() => handlePin({ id: p.messageId })}>
                  <Text style={{ color: theme.colors.primary, fontWeight: "700", fontSize: 11 }}>Unpin</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
      <FlatList
        ref={flatRef as any}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
        renderItem={({ item }) => {
          const isOwn = item.senderId === account?.id || item.accountId === account?.id;
          const isDeleted = !!item.deletedAt;
          const edited = item.editedAt && !isDeleted;
          return (
            <View style={[styles.bubbleWrap, isOwn ? styles.ownWrap : styles.otherWrap, rtl && { flexDirection: "row-reverse" }]}>
              <View
                style={[
                  styles.bubble,
                  {
                    backgroundColor: isOwn ? theme.colors.primary : theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                  isDeleted && { opacity: 0.6 },
                ]}
              >
                {item.replyTo ? <Text style={[styles.reply, { color: isOwn ? "#FCF6EF" : theme.colors.textSecondary }]}>↳ {item.replyTo?.slice(0, 40)}</Text> : null}
                {editingId === item.id ? (
                  <View>
                    <TextInput value={editText} onChangeText={setEditText} style={[styles.editInput, { borderColor: theme.colors.border, color: isOwn ? "#FCF6EF" : theme.colors.text }]} multiline />
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                      <Pressable onPress={() => handleEdit(item)} style={[styles.smallBtn, { backgroundColor: theme.colors.success }]}>
                        <Text style={styles.smallBtnText}>Save</Text>
                      </Pressable>
                      <Pressable onPress={() => setEditingId(null)} style={[styles.smallBtn, { backgroundColor: theme.colors.surfaceHover, borderColor: theme.colors.border }]}>
                        <Text style={[styles.smallBtnText, { color: theme.colors.text }]}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Text style={[styles.content, { color: isOwn ? "#FCF6EF" : theme.colors.text }]}>{renderMentions(item.content, theme)}</Text>
                )}
                <View style={{ flexDirection: "row", gap: 6, marginTop: 4, alignItems: "center" }}>
                  <Text style={[styles.meta, { color: isOwn ? "rgba(252,246,239,0.8)" : theme.colors.textTertiary }]}>{formatDateTime(item.createdAt, "en")}{edited ? " • edited" : ""}</Text>
                  {isOwn && item.readAt ? <Text style={{ color: isOwn ? "#FCF6EF" : theme.colors.success, fontSize: 10 }}>✓✓</Text> : null}
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {!isDeleted ? (
                    <>
                      <Pressable onPress={() => handleReaction(item)} style={styles.action}>
                        <Text style={{ fontSize: 12 }}>🤝 {item.reactions?.length || 0}</Text>
                      </Pressable>
                      <Pressable onPress={() => handlePin(item)} style={styles.action}>
                        <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: "600" }}>{conv?.pinnedMessages?.some((p: any) => p.messageId === item.id) ? "Unpin" : "Pin"}</Text>
                      </Pressable>
                      {canEdit(item) ? (
                        <Pressable
                          onPress={() => {
                            setEditingId(item.id);
                            setEditText(item.content);
                          }}
                          style={styles.action}
                        >
                          <Text style={{ color: theme.colors.primary, fontSize: 11 }}>Edit</Text>
                        </Pressable>
                      ) : null}
                      {(isOwn || account?.role === "admin") ? (
                        <Pressable onPress={() => handleDelete(item)} style={styles.action}>
                          <Text style={{ color: theme.colors.error, fontSize: 11 }}>Delete</Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </View>
            </View>
          );
        }}
      />
      {typing ? (
        <View style={[styles.typing, { backgroundColor: theme.colors.surfaceHover }]}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 11 }}>{typing} typing...</Text>
        </View>
      ) : null}
      <View style={[styles.composer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }, rtl && { flexDirection: "row-reverse" }]}>
        <TextInput
          testID="chat-composer-input"
          accessibilityLabel="message input"
          value={composer}
          onChangeText={(t) => {
            setComposer(t);
            const s = getSocket();
            if (s) s.emit("chat:typing", { conversationId: convId });
          }}
          placeholder="Message… @tag supported"
          style={[styles.input, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder, color: theme.colors.text }, rtl && { textAlign: "right" }]}
          placeholderTextColor={theme.colors.textTertiary}
          multiline
          maxLength={2000}
        />
        <Pressable testID="chat-send-button" accessibilityRole="button" onPress={handleSend} disabled={sending || !composer.trim()} style={[styles.sendBtn, { backgroundColor: composer.trim() ? theme.colors.primary : theme.colors.border }]}>
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Send</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function renderMentions(text: string, theme: any) {
  // Simple mention highlight for @workers etc.
  return text;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 12, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: "800" },
  subtitle: { fontSize: 11, marginTop: 2 },
  pinnedSection: { margin: 8, borderRadius: 8, padding: 10, borderWidth: 1 },
  pinnedTitle: { fontWeight: "700", fontSize: 11, marginBottom: 4 },
  pinnedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  pinnedText: { fontSize: 12, flex: 1 },
  bubbleWrap: { flexDirection: "row", marginTop: 8 },
  ownWrap: { justifyContent: "flex-end" },
  otherWrap: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 12, padding: 10, borderWidth: 1 },
  content: { fontSize: 13, lineHeight: 18 },
  reply: { fontSize: 11, fontStyle: "italic", marginBottom: 4 },
  meta: { fontSize: 10, marginTop: 4 },
  action: { paddingHorizontal: 6, paddingVertical: 2 },
  composer: { flexDirection: "row", alignItems: "flex-end", padding: 8, borderTopWidth: 1, gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, maxHeight: 100 },
  sendBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, minWidth: 60, alignItems: "center" },
  typing: { padding: 6, alignItems: "center" },
  editInput: { borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 13, minHeight: 40 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  smallBtnText: { color: "#fff", fontWeight: "700", fontSize: 11 },
});
