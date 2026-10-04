import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useTheme } from "@/theme/useTheme";
import { useAuthStore } from "@/stores/auth-store";
import {
  getConversation,
  getMessages,
  sendMessage,
  uploadAttachment,
  editMessage,
  deleteMessage,
  toggleReaction,
  pinMessage,
  unpinMessage,
  markRead,
  type ChatAttachment,
} from "@/services/chat.service";
import { getSocket } from "@/services/socket";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { useLanguage } from "@/i18n";
import { formatDateTime } from "@/utils/date";

const PAGE_LIMIT = 30;
// Production caps mirror the backend (images 8 MB, videos 25 MB). The client
// pre-checks picker fileSize so oversized media fails fast with a clear label;
// the backend re-validates authoritatively.
const CLIENT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const CLIENT_VIDEO_MAX_BYTES = 25 * 1024 * 1024;

// Local selection staged above the composer. Bytes are uploaded as multipart
// binary at send time (never base64); the returned server record id is what
// the message references. uploadedRef survives a failed send so retry reuses
// the same upload without sending bytes twice.
type PendingAttachment = {
  kind: "image" | "video";
  localUri: string;
  mimeType: string;
  name: string;
  width?: number | null;
  height?: number | null;
};

function msgId(m: any): string {
  return String(m?.id ?? "");
}

function senderOf(m: any): string | undefined {
  return m?.senderAccountId ?? m?.senderId ?? m?.accountId;
}

function mergeMessages(prev: any[], incoming: any[]): any[] {
  const map = new Map<string, any>();
  for (const m of prev) if (msgId(m)) map.set(msgId(m), m);
  for (const m of incoming) if (msgId(m)) map.set(msgId(m), m);
  return [...map.values()].sort((a, b) => (a?.createdAt || 0) - (b?.createdAt || 0));
}

function contentLabel(m: any): string {
  const c = typeof m?.content === "string" && m.content.trim() ? m.content : "";
  if (c) return c;
  const atts: any[] = Array.isArray(m?.attachments) ? m.attachments : [];
  if (atts.some((a) => a?.kind === "image") && atts.some((a) => a?.kind === "video")) return "[Media]";
  if (atts.some((a) => a?.kind === "image")) return "[Image]";
  if (atts.some((a) => a?.kind === "video")) return "[Video]";
  return "";
}

export default function ChatDetail() {
  const { theme } = useTheme();
  const { t, isRTL } = useLanguage();
  const rtl = isRTL;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = String(id);
  const account = useAuthStore((s) => s.account);
  const myId = account?.id;
  const { width: winWidth } = useWindowDimensions();
  const wide = winWidth >= 700;

  const [conv, setConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [composer, setComposer] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [uploaded, setUploaded] = useState<ChatAttachment | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const flatRef = useRef<FlatList>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, []);

  const handleBack = useCallback(() => {
    try {
      const r: any = router as any;
      if (typeof r.canGoBack === "function" && !r.canGoBack()) {
        router.replace("/(app)/chats" as any);
        return;
      }
    } catch {}
    try {
      router.back();
    } catch {
      router.replace("/(app)/chats" as any);
    }
  }, [router]);
  // NOTE: Android hardware Back pops this Stack screen to the previous chat
  // list automatically (conversation lives outside Tabs). No custom BackHandler
  // is registered so the two mechanisms cannot fight.

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const c = await getConversation(convId);
      if (!mountedRef.current) return;
      setConv(c);
      // Backend listMessages already returns oldest-first; do NOT reverse.
      const msgs = await getMessages(convId, { limit: PAGE_LIMIT });
      if (!mountedRef.current) return;
      setMessages(Array.isArray(msgs) ? msgs : []);
      setHasMore((msgs || []).length >= PAGE_LIMIT);
      // Mark the whole conversation read (no upTo = all messages).
      markRead(convId).catch(() => {});
    } catch (e: any) {
      if (mountedRef.current) setError(e?.message || "Failed to load conversation");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [convId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0]?.createdAt;
      const older = await getMessages(convId, { limit: PAGE_LIMIT, before: oldest });
      if (!mountedRef.current) return;
      if (!older || older.length === 0) {
        setHasMore(false);
        return;
      }
      setMessages((prev) => mergeMessages(older, prev));
      if (older.length < PAGE_LIMIT) setHasMore(false);
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not load older messages");
    } finally {
      if (mountedRef.current) setLoadingOlder(false);
    }
  }, [convId, loadingOlder, hasMore, messages]);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    // Explicit join covers conversations created after the socket connected
    // (server auto-join only covers memberships at connect time).
    try {
      s.emit("chat:join", { conversationId: convId });
    } catch {}
    const onNew = (p: any) => {
      if (p?.conversationId !== convId || !p?.message) return;
      // Upsert by id: dedupes the server echo of our own just-sent message.
      setMessages((prev) => mergeMessages(prev, [p.message]));
      // The open conversation must not remain unread.
      markRead(convId).catch(() => {});
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 120);
    };
    const onEdited = (p: any) => {
      if (!p?.message) return;
      setMessages((prev) => prev.map((m) => (msgId(m) === msgId(p.message) ? p.message : m)));
    };
    const onDeleted = (p: any) => {
      if (!p?.messageId) return;
      setMessages((prev) =>
        prev.map((m) => (msgId(m) === String(p.messageId) ? { ...m, isDeleted: true, deletedAt: Date.now(), content: "Message deleted", attachments: [] } : m)),
      );
    };
    const onReaction = (p: any) => {
      if (!p?.message) return;
      setMessages((prev) => prev.map((m) => (msgId(m) === msgId(p.message) ? p.message : m)));
    };
    const onPinned = (p: any) => {
      if (p?.conversation) setConv(p.conversation);
    };
    const onTyping = (p: any) => {
      if (p?.conversationId !== convId || p?.accountId === myId) return;
      const who = p?.displayName || p?.tag || "Someone";
      setTyping(who);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        if (mountedRef.current) setTyping(null);
      }, 3000);
    };
    const onReconnect = async () => {
      // Refetch the tail after reconnect so nothing is missed.
      try {
        const latest = await getMessages(convId, { limit: PAGE_LIMIT });
        if (mountedRef.current && Array.isArray(latest)) setMessages((prev) => mergeMessages(prev, latest));
        try {
          s.emit("chat:join", { conversationId: convId });
        } catch {}
      } catch {}
    };
    s.on("chat:newMessage", onNew);
    s.on("chat:messageEdited", onEdited);
    s.on("chat:messageDeleted", onDeleted);
    s.on("chat:reactionUpdated", onReaction);
    s.on("chat:pinnedUpdated", onPinned);
    s.on("chat:typing", onTyping);
    s.on("connect", onReconnect);
    return () => {
      s.off("chat:newMessage", onNew);
      s.off("chat:messageEdited", onEdited);
      s.off("chat:messageDeleted", onDeleted);
      s.off("chat:reactionUpdated", onReaction);
      s.off("chat:pinnedUpdated", onPinned);
      s.off("chat:typing", onTyping);
      s.off("connect", onReconnect);
      try {
        s.emit("chat:leave", { conversationId: convId });
      } catch {}
    };
  }, [convId, myId]);

  const pickAttachment = useCallback(async () => {
    if (picking || sending || uploading) return;
    setAttachError(null);
    setPicking(true);
    try {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        setAttachError(t("conversation.unsupportedType", "Unsupported media type"));
        Alert.alert(t("common.error", "Something went wrong"), "Gallery permission denied. Enable in settings.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 0.8,
        exif: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0] as any;
      const isVideo = asset.type === "video" || String(asset.mimeType || "").startsWith("video/");
      if (isVideo) {
        // Video binary uploads via multipart at send time — never read into
        // JS memory as base64. Oversized clips fail fast here AND server-side.
        const mimeType = String(asset.mimeType || "video/mp4").split(";")[0].trim().toLowerCase();
        if (typeof asset.fileSize === "number" && asset.fileSize > CLIENT_VIDEO_MAX_BYTES) {
          setAttachError(t("conversation.mediaTooLarge", "Media too large (images 8 MB, videos 25 MB max)"));
          return;
        }
        setAttachment({
          kind: "video",
          localUri: asset.uri,
          mimeType,
          name: asset.fileName || "video.mp4",
          width: asset.width ?? null,
          height: asset.height ?? null,
        });
        setUploaded(null);
        return;
      }
      // Image: single normalize pass (max dimension 1600, JPEG) — no loops,
      // no base64. The manipulated FILE uri is staged for multipart upload.
      const manip = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      setAttachment({
        kind: "image",
        localUri: manip.uri,
        mimeType: "image/jpeg",
        name: "image.jpg",
        width: manip.width,
        height: manip.height,
      });
      setUploaded(null);
    } catch (e: any) {
      setAttachError(e?.message || t("conversation.uploadFailed", "Upload failed. Retry or remove the attachment."));
    } finally {
      setPicking(false);
    }
  }, [picking, sending, uploading, t]);

  const handleSend = useCallback(async () => {
    const text = composer.trim();
    if (sending || picking || uploading) return; // prevent rapid double-send
    if (!text && !attachment && !uploaded) {
      Alert.alert(t("common.error", "Something went wrong"), t("conversation.emptyError", "Write a message or attach media"));
      return;
    }
    if (text.length > 2000) {
      Alert.alert(t("common.error", "Something went wrong"), t("conversation.tooLong", "Max 2000 characters"));
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      // Upload bytes first (multipart binary). A completed upload is kept in
      // uploadedRef: if the message send below fails, retry reuses the same
      // upload id — no duplicate upload, no lost media.
      let record = uploaded;
      if (attachment && !record) {
        setUploading(true);
        try {
          record = await uploadAttachment(convId, {
            uri: attachment.localUri,
            mimeType: attachment.mimeType,
            name: attachment.name,
          });
          if (mountedRef.current) setUploaded(record);
        } finally {
          if (mountedRef.current) setUploading(false);
        }
      }
      const msg = await sendMessage(convId, text, null, record ? [record.id] : undefined);
      // Upsert (not blind append): safe even if the socket echo arrived first.
      setMessages((prev) => mergeMessages(prev, [msg]));
      setComposer("");
      setAttachment(null);
      setUploaded(null);
      setAttachError(null);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e: any) {
      // Keep composer + staged/uploaded attachment so nothing is silently discarded.
      setSendError(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  }, [composer, attachment, uploaded, sending, picking, uploading, convId, t]);

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
      const updated = await editMessage(msgId(m), editText.trim());
      setMessages((prev) => prev.map((x) => (msgId(x) === msgId(m) ? updated : x)));
      setEditingId(null);
      setEditText("");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Edit failed");
    }
  };

  const handleDelete = async (m: any) => {
    Alert.alert("Delete message", "Delete this message?", [
      { text: t("conversation.cancel", "Cancel"), style: "cancel" },
      {
        text: t("conversation.delete", "Delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMessage(msgId(m));
            setMessages((prev) =>
              prev.map((x) => (msgId(x) === msgId(m) ? { ...x, isDeleted: true, deletedAt: Date.now(), content: "Message deleted", attachments: [] } : x)),
            );
          } catch (e: any) {
            Alert.alert("Failed", e?.message || "Delete failed");
          }
        },
      },
    ]);
  };

  const handleReaction = async (m: any) => {
    const mid = msgId(m);
    if (reactingId) return; // serialize toggles: backend read-modify-write races otherwise
    setReactingId(mid);
    try {
      const updated = await toggleReaction(mid);
      setMessages((prev) => prev.map((x) => (msgId(x) === mid ? updated : x)));
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Reaction failed");
    } finally {
      setReactingId(null);
    }
  };

  const handlePin = async (m: any) => {
    const mid = msgId(m);
    const isPinned = conv?.pinnedMessages?.some((p: any) => p.messageId === mid);
    try {
      if (isPinned) await unpinMessage(convId, mid);
      else await pinMessage(convId, mid);
      const c = await getConversation(convId);
      setConv(c);
    } catch (e: any) {
      Alert.alert("Failed", e?.message || (isPinned ? "Unpin failed" : "Pin failed (max 3?)"));
    }
  };

  const canEdit = (m: any) => {
    if (senderOf(m) !== myId) return false;
    if (m?.isDeleted || m?.deletedAt) return false;
    const elapsed = Date.now() - (m?.createdAt || 0);
    return elapsed <= 15 * 60 * 1000;
  };

  const title = useMemo(() => {
    if (conv?.name) return conv.name;
    const names = (conv?.participants || [])
      .map((p: any) => p?.account?.displayName || p?.account?.tag)
      .filter(Boolean);
    return names.slice(0, 3).join(", ") || "Chat";
  }, [conv]);

  const subtitle = useMemo(() => {
    const count = conv?.participants?.length || 0;
    const unit = count === 1 ? t("conversation.member", "member") : t("conversation.members", "members");
    const pinned = conv?.pinnedMessages?.length || 0;
    return `${count} ${unit}${pinned ? ` • ${pinned}/3 ${t("conversation.pinned", "Pinned").toLowerCase()}` : ""}`;
  }, [conv, t]);

  if (loading) return <Loading message="Loading conversation..." />;
  if (error) return <ErrorState title="Could not load chat" message={error} onRetry={load} />;

  const pinned = conv?.pinnedMessages || [];
  const byId = new Map(messages.map((m) => [msgId(m), m]));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }, rtl && { flexDirection: "row-reverse" }]}>
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={t("conversation.back", "Back")}
            hitSlop={10}
            style={[styles.backBtn, { borderColor: theme.colors.border }]}
          >
            <Ionicons name={rtl ? "chevron-forward" : "chevron-back"} size={22} color={theme.colors.text} />
          </Pressable>
          <View style={[styles.headerText, rtl && { alignItems: "flex-end" }]}>
            <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>

        {pinned.length > 0 ? (
          <View style={[styles.pinnedSection, { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warning }]}>
            <Text style={[styles.pinnedTitle, { color: theme.colors.warning }]}>
              {t("conversation.pinned", "Pinned")} ({pinned.length}/3)
            </Text>
            {pinned.map((p: any) => {
              const msg = byId.get(String(p.messageId));
              return (
                <View key={String(p.messageId)} style={styles.pinnedRow}>
                  <Text style={[styles.pinnedText, { color: theme.colors.text }]} numberOfLines={1}>
                    {msg ? contentLabel(msg) || String(p.messageId) : String(p.messageId)}
                  </Text>
                  <Pressable onPress={() => handlePin({ id: p.messageId })}>
                    <Text style={{ color: theme.colors.primary, fontWeight: "700", fontSize: 11 }}>{t("conversation.unpin", "Unpin")}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={[styles.column, wide && styles.columnWide]}>
          <FlatList
            ref={flatRef as any}
            data={messages}
            keyExtractor={(item) => msgId(item)}
            style={styles.flex}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              hasMore && messages.length > 0 ? (
                <Pressable onPress={loadOlder} disabled={loadingOlder} style={[styles.loadOlder, { borderColor: theme.colors.border }]}>
                  {loadingOlder ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Text style={[styles.loadOlderText, { color: theme.colors.primary }]}>{t("conversation.loadOlder", "Load older messages")}</Text>
                  )}
                </Pressable>
              ) : null
            }
            onContentSizeChange={() => {
              // Only auto-anchor on first paint; live arrivals scroll explicitly.
            }}
            renderItem={({ item }) => {
              const own = senderOf(item) === myId;
              const isDeleted = !!(item.isDeleted || item.deletedAt);
              const edited = item.editedAt && !isDeleted;
              const atts: any[] = Array.isArray(item.attachments) ? item.attachments : [];
              const replyOrig = item.replyToMessageId ? byId.get(String(item.replyToMessageId)) : null;
              const readByOthers = Array.isArray(item.readBy) && item.readBy.some((r: any) => r?.accountId && r.accountId !== myId);
              return (
                <View style={[styles.bubbleWrap, own ? styles.ownWrap : styles.otherWrap, rtl && { flexDirection: "row-reverse" }]}>
                  <View
                    style={[
                      styles.bubble,
                      {
                        backgroundColor: own ? theme.colors.primary : theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                      isDeleted && { opacity: 0.6 },
                    ]}
                  >
                    {item.replyToMessageId ? (
                      <Text style={[styles.reply, { color: own ? "#FCF6EF" : theme.colors.textSecondary }]} numberOfLines={2}>
                        ↳ {replyOrig ? contentLabel(replyOrig).slice(0, 60) : String(item.replyToMessageId).slice(0, 40)}
                      </Text>
                    ) : null}
                    {atts.map((a, idx) => {
                      // URL-based attachments only. Anything without an http(s)
                      // url (e.g. legacy inline payloads) is skipped, never
                      // rendered as binary.
                      const url = typeof a?.url === "string" && /^https?:\/\//i.test(a.url) ? a.url : null;
                      if (!url) return null;
                      if (a?.kind === "image") {
                        const aw = Number(a.width) || 4;
                        const ah = Number(a.height) || 3;
                        const ratio = Math.min(Math.max(ah / aw, 0.4), 1.4);
                        return (
                          <Pressable key={idx} onPress={() => setPreviewImg(url)} accessibilityLabel={t("conversation.openPreview", "Open preview")}>
                            <Image
                              source={{ uri: url }}
                              style={[styles.attachmentImage, { aspectRatio: aw / ah > 0 ? aw / ah : 4 / 3, minHeight: 120 * ratio + 60 }]}
                              resizeMode="cover"
                            />
                          </Pressable>
                        );
                      }
                      if (a?.kind === "video") {
                        // No native video player installed (expo-video would
                        // force a dev-client rebuild): system/browser playback
                        // via Linking. Reported as a known limitation.
                        return (
                          <Pressable
                            key={idx}
                            onPress={() => {
                              Linking.openURL(url).catch(() =>
                                Alert.alert(
                                  t("conversation.videoAttachment", "Video attachment"),
                                  t("conversation.openVideoFailed", "Could not open video"),
                                ),
                              );
                            }}
                            style={[styles.videoBox, { borderColor: own ? "rgba(252,246,239,0.5)" : theme.colors.border }]}
                          >
                            <Ionicons name="play-circle" size={30} color={own ? "#FCF6EF" : theme.colors.primary} />
                            <Text style={[styles.videoText, { color: own ? "#FCF6EF" : theme.colors.text }]}>
                              {t("conversation.openVideo", "Open video")}
                              {a?.size ? ` • ${Math.max(1, Math.round(Number(a.size) / 1024))} KB` : ""}
                            </Text>
                          </Pressable>
                        );
                      }
                      return null;
                    })}
                    {editingId === msgId(item) ? (
                      <View>
                        <TextInput
                          value={editText}
                          onChangeText={setEditText}
                          style={[styles.editInput, { borderColor: theme.colors.border, color: own ? "#FCF6EF" : theme.colors.text }]}
                          multiline
                        />
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                          <Pressable onPress={() => handleEdit(item)} style={[styles.smallBtn, { backgroundColor: theme.colors.success }]}>
                            <Text style={styles.smallBtnText}>{t("conversation.save", "Save")}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setEditingId(null)}
                            style={[styles.smallBtn, { backgroundColor: theme.colors.surfaceHover, borderColor: theme.colors.border }]}
                          >
                            <Text style={[styles.smallBtnText, { color: theme.colors.text }]}>{t("conversation.cancel", "Cancel")}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : item.content ? (
                      <Text style={[styles.content, { color: own ? "#FCF6EF" : theme.colors.text }]}>{item.content}</Text>
                    ) : null}
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 4, alignItems: "center" }}>
                      <Text style={[styles.meta, { color: own ? "rgba(252,246,239,0.8)" : theme.colors.textTertiary }]}>
                        {formatDateTime(item.createdAt, "en")}
                        {edited ? ` • ${t("conversation.edited", "edited")}` : ""}
                      </Text>
                      {own && readByOthers ? <Text style={{ color: own ? "#FCF6EF" : theme.colors.success, fontSize: 10 }}>✓✓</Text> : null}
                    </View>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                      {!isDeleted ? (
                        <>
                          <Pressable onPress={() => handleReaction(item)} disabled={reactingId === msgId(item)} style={styles.action}>
                            <Text style={{ fontSize: 12 }}>
                              🤝 {item.reactions?.length || 0}
                              {reactingId === msgId(item) ? "…" : ""}
                            </Text>
                          </Pressable>
                          <Pressable onPress={() => handlePin(item)} style={styles.action}>
                            <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: "600" }}>
                              {conv?.pinnedMessages?.some((p: any) => p.messageId === msgId(item)) ? t("conversation.unpin", "Unpin") : t("conversation.pin", "Pin")}
                            </Text>
                          </Pressable>
                          {canEdit(item) ? (
                            <Pressable
                              onPress={() => {
                                setEditingId(msgId(item));
                                setEditText(item.content || "");
                              }}
                              style={styles.action}
                            >
                              <Text style={{ color: theme.colors.primary, fontSize: 11 }}>{t("conversation.edit", "Edit")}</Text>
                            </Pressable>
                          ) : null}
                          {(own || account?.role === "admin") ? (
                            <Pressable onPress={() => handleDelete(item)} style={styles.action}>
                              <Text style={{ color: theme.colors.error, fontSize: 11 }}>{t("conversation.delete", "Delete")}</Text>
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
              <Text style={{ color: theme.colors.textSecondary, fontSize: 11 }}>
                {typing} {t("conversation.typing", "typing...")}
              </Text>
            </View>
          ) : null}
          {attachment ? (
            <View style={[styles.previewBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }, rtl && { flexDirection: "row-reverse" }]}>
              {attachment.kind === "image" ? (
                <Image source={{ uri: attachment.localUri }} style={styles.previewThumb} />
              ) : (
                <View style={[styles.previewThumb, styles.previewVideo, { borderColor: theme.colors.border }]}>
                  <Ionicons name="videocam" size={20} color={theme.colors.primary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.previewLabel, { color: theme.colors.text }]} numberOfLines={1}>
                  {attachment.kind === "image" ? t("conversation.imageAttachment", "Image attachment") : t("conversation.videoAttachment", "Video attachment")}
                  {uploaded ? ` • ${t("conversation.ready", "Ready")}` : uploading ? ` • ${t("conversation.uploading", "Uploading…")}` : ""}
                </Text>
                {attachError ? <Text style={[styles.previewError, { color: theme.colors.error }]}>{attachError}</Text> : null}
              </View>
              <Pressable
                onPress={() => {
                  setAttachment(null);
                  setUploaded(null);
                  setAttachError(null);
                }}
                accessibilityLabel={t("conversation.removeAttachment", "Remove attachment")}
                style={[styles.previewRemove, { borderColor: theme.colors.border }]}
              >
                <Ionicons name="close" size={16} color={theme.colors.text} />
              </Pressable>
            </View>
          ) : null}
          {attachError && !attachment ? (
            <View style={[styles.inlineError, { backgroundColor: theme.colors.errorSoft || theme.colors.surfaceHover }]}>
              <Text style={[styles.inlineErrorText, { color: theme.colors.error }]}>{attachError}</Text>
            </View>
          ) : null}
          {sendError ? (
            <View style={[styles.inlineError, { backgroundColor: theme.colors.errorSoft || theme.colors.surfaceHover }]}>
              <Text style={[styles.inlineErrorText, { color: theme.colors.error }]}>{sendError}</Text>
            </View>
          ) : null}
          <View style={[styles.composer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }, rtl && { flexDirection: "row-reverse" }]}>
            <Pressable
              onPress={pickAttachment}
              disabled={picking || sending || uploading}
              accessibilityRole="button"
              accessibilityLabel={t("conversation.attach", "Attach photo or video")}
              style={[styles.attachBtn, { borderColor: theme.colors.border, opacity: picking || sending || uploading ? 0.5 : 1 }]}
            >
              {picking ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Ionicons name="add" size={22} color={theme.colors.primary} />}
            </Pressable>
            <TextInput
              testID="chat-composer-input"
              accessibilityLabel="message input"
              value={composer}
              onChangeText={(tx) => {
                setComposer(tx);
                const s = getSocket();
                if (s) {
                  try {
                    s.emit("chat:typing", { conversationId: convId, isTyping: true });
                  } catch {}
                }
              }}
              onFocus={() => setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 250)}
              placeholder={t("conversation.messagePlaceholder", "Message… @tag supported")}
              style={[styles.input, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder, color: theme.colors.text }, rtl && { textAlign: "right" }]}
              placeholderTextColor={theme.colors.textTertiary}
              multiline
              maxLength={2000}
            />
            <Pressable
              testID="chat-send-button"
              accessibilityRole="button"
              onPress={handleSend}
              disabled={sending || picking || uploading || (!composer.trim() && !attachment && !uploaded)}
              style={[styles.sendBtn, { backgroundColor: composer.trim() || attachment || uploaded ? theme.colors.primary : theme.colors.border }]}
            >
              {sending || uploading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>{t("conversation.send", "Send")}</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!previewImg} transparent animationType="fade" onRequestClose={() => setPreviewImg(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPreviewImg(null)}>
          <View style={styles.modalBody}>
            {previewImg ? <Image source={{ uri: previewImg }} style={styles.modalImage} resizeMode="contain" /> : null}
            <Pressable onPress={() => setPreviewImg(null)} style={[styles.modalClose, { backgroundColor: theme.colors.surface }]}>
              <Text style={{ color: theme.colors.text, fontWeight: "700" }}>{t("common.close", "Close")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  backBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: "800" },
  subtitle: { fontSize: 11, marginTop: 2 },
  pinnedSection: { margin: 8, borderRadius: 8, padding: 10, borderWidth: 1 },
  pinnedTitle: { fontWeight: "700", fontSize: 11, marginBottom: 4 },
  pinnedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  pinnedText: { fontSize: 12, flex: 1 },
  column: { flex: 1, width: "100%", alignSelf: "center" },
  columnWide: { maxWidth: 760 },
  listContent: { padding: 12, paddingBottom: 12, flexGrow: 1 },
  loadOlder: { alignSelf: "center", borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 10 },
  loadOlderText: { fontSize: 12, fontWeight: "700" },
  bubbleWrap: { flexDirection: "row", marginTop: 8 },
  ownWrap: { justifyContent: "flex-end" },
  otherWrap: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", minWidth: 64, borderRadius: 12, padding: 10, borderWidth: 1 },
  content: { fontSize: 13, lineHeight: 18 },
  reply: { fontSize: 11, fontStyle: "italic", marginBottom: 4 },
  meta: { fontSize: 10, marginTop: 4 },
  action: { paddingHorizontal: 6, paddingVertical: 2 },
  attachmentImage: { width: 220, maxWidth: "100%", borderRadius: 8, marginBottom: 6, backgroundColor: "#00000010" },
  videoBox: { width: 220, maxWidth: "100%", borderRadius: 8, marginBottom: 6, padding: 14, borderWidth: 1, alignItems: "center", gap: 6 },
  videoText: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  typing: { padding: 6, alignItems: "center" },
  previewBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1 },
  previewThumb: { width: 48, height: 48, borderRadius: 8 },
  previewVideo: { borderWidth: 1, alignItems: "center", justifyContent: "center" },
  previewLabel: { fontSize: 12, fontWeight: "600" },
  previewError: { fontSize: 11, marginTop: 2 },
  previewRemove: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  inlineError: { paddingHorizontal: 12, paddingVertical: 7 },
  inlineErrorText: { fontSize: 11, fontWeight: "600" },
  composer: { flexDirection: "row", alignItems: "flex-end", padding: 8, borderTopWidth: 1, gap: 8 },
  attachBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, maxHeight: 110 },
  sendBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, minWidth: 60, minHeight: 42, alignItems: "center", justifyContent: "center" },
  editInput: { borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 13, minHeight: 40 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  smallBtnText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalBody: { width: "100%", maxWidth: 640, alignItems: "center", gap: 12 },
  modalImage: { width: "100%", height: 420, borderRadius: 12 },
  modalClose: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
});
