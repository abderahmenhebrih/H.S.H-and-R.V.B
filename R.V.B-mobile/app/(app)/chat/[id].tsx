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
  Animated,
  PanResponder,
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
  setReaction,
  pinMessage,
  unpinMessage,
  markRead,
  type ChatAttachment,
} from "@/services/chat.service";
import {
  QUICK_REACTIONS,
  QUICK_SEND_EMOJI,
  REACTION_CATEGORIES,
  groupReactionCounts,
  getMyReaction,
  isQuickEmojiMessage,
} from "@/constants/reactions";
import { getSocket } from "@/services/socket";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Avatar } from "@/components/common/Avatar";
import { useLanguage } from "@/i18n";
import { formatDate, type Language } from "@/utils/date";

const PAGE_LIMIT = 30;
// Instagram-style gesture arbitration (built-in PanResponder only — no
// native gesture dependency, no dev-client rebuild):
//   SWIPE (right,|dx| dominant + threshold) -> Reply
//   LONG PRESS (~450ms, no swipe)           -> full action menu
//   DOUBLE TAP (two taps < 300ms)           -> quick reaction strip
//   SINGLE TAP                              -> content action (image/quote/…)
// Single taps route through the same per-message tap registry so a first tap
// never fires its action early when a double-tap is coming.
const SWIPE_THRESHOLD = 55;
const DOUBLE_TAP_MS = 300;
const LONG_PRESS_MS = 450;

type RowFx = {
  tx: Animated.Value;
  tapTime: number;
  tapTimer: ReturnType<typeof setTimeout> | null;
  fired: boolean;
  view: any;
};
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
  // WEB ONLY: browsers stringify plain {uri,type,name} objects (multer then
  // sees no file part), so the screen resolves a real Blob at pick time
  // (picker File when provided, else fetch(objectUrl) -> Blob) and the
  // service appends it. Native keeps the {uri,type,name} file object.
  blob?: Blob | null;
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

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatTime(ms: number | null | undefined, lang: Language): string {
  if (!ms) return "";
  try {
    const locale = lang === "fr" ? "fr-FR" : lang === "ar" ? "ar-DZ" : "en-GB";
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  } catch {
    return "";
  }
}

export default function ChatDetail() {
  const { theme } = useTheme();
  const { t, lang, isRTL } = useLanguage();
  const rtl = isRTL;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = String(id);
  const account = useAuthStore((s) => s.account);
  const myId = account?.id;
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const wide = winWidth >= 700;

  const [conv, setConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [composer, setComposer] = useState("");
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [menuMsg, setMenuMsg] = useState<any | null>(null);
  // Two-step in-menu delete confirmation (no OS Alert: Alert.alert fired
  // right after a Modal close is swallowed on Android, and multi-button
  // Alert is unreliable on Expo Web — both present as "delete does nothing").
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [stripMsg, setStripMsg] = useState<any | null>(null);
  const [stripAnchorY, setStripAnchorY] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCat, setPickerCat] = useState<string>("frequent");
  const [whoMsg, setWhoMsg] = useState<any | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [newArrived, setNewArrived] = useState(false);
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
  // Per-message gesture scratch (Animated values, tap windows, row views).
  // Screen-level maps: renderItem must stay hook-free.
  const rowFx = useRef(new Map<string, RowFx>());
  const flatRef = useRef<FlatList>(null);
  const fx = (mid: string): RowFx => {
    let r = rowFx.current.get(mid);
    if (!r) {
      r = { tx: new Animated.Value(0), tapTime: 0, tapTimer: null, fired: false, view: null };
      rowFx.current.set(mid, r);
    }
    return r;
  };
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const nearBottomRef = useRef(true);
  const newArrivedRef = useRef(false);
  const initialAnchoredRef = useRef(false);
  const rowY = useRef(new Map<string, number>());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (hlTimer.current) clearTimeout(hlTimer.current);
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

  const scrollToEnd = useCallback((animated = true) => {
    try {
      (flatRef.current as any)?.scrollToEnd?.({ animated });
    } catch {}
  }, []);

  const scrollToMessage = useCallback(
    (mid: string) => {
      const y = rowY.current.get(String(mid));
      if (typeof y !== "number") return;
      try {
        (flatRef.current as any)?.scrollToOffset?.({ offset: Math.max(0, y - 90), animated: true });
      } catch {}
      setHighlightId(String(mid));
      if (hlTimer.current) clearTimeout(hlTimer.current);
      hlTimer.current = setTimeout(() => {
        if (mountedRef.current) setHighlightId(null);
      }, 1400);
    },
    [],
  );

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
      rowY.current.clear();
      rowFx.current.clear();
      initialAnchoredRef.current = false;
      nearBottomRef.current = true;
      newArrivedRef.current = false;
      setNewArrived(false);
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
      // maintainVisibleContentPosition on the list preserves visual position.
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
      const mine = senderOf(p.message) === myId;
      if (mine || nearBottomRef.current) {
        setTimeout(() => scrollToEnd(true), 120);
      } else if (!newArrivedRef.current) {
        // Reading older history: never yank scroll; offer a chip instead.
        newArrivedRef.current = true;
        setNewArrived(true);
      }
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
  }, [convId, myId, scrollToEnd]);

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
      const onWeb = Platform.OS === "web";
      if (onWeb) {
        // WEB: resolve a real Blob now (never a plain object in FormData).
        // Prefer the picker-provided File; else fetch the object/blob URL.
        // Original bytes are uploaded (no manipulator pass on web); the
        // backend caps + magic-byte sniffing remain authoritative.
        let blob: Blob | null = null;
        const maybeFile = asset.file;
        if (typeof Blob !== "undefined" && maybeFile instanceof Blob) {
          blob = maybeFile;
        } else {
          const fetched = await fetch(asset.uri);
          blob = await fetched.blob();
        }
        const kind: "image" | "video" = isVideo ? "video" : "image";
        const mimeType = String(blob.type || asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg")).split(";")[0].trim().toLowerCase();
        const cap = isVideo ? CLIENT_VIDEO_MAX_BYTES : CLIENT_IMAGE_MAX_BYTES;
        if (blob.size <= 0 || blob.size > cap) {
          setAttachError(t("conversation.mediaTooLarge", "Media too large (images 8 MB, videos 25 MB max)"));
          return;
        }
        const webName =
          asset.fileName || (maybeFile && typeof maybeFile.name === "string" && maybeFile.name) || (isVideo ? "video.mp4" : "image.jpg");
        setAttachment({
          kind,
          localUri: asset.uri,
          mimeType,
          name: webName,
          width: asset.width ?? null,
          height: asset.height ?? null,
          blob,
        });
        setUploaded(null);
        return;
      }
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
            blob: attachment.blob ?? null,
          });
          if (mountedRef.current) setUploaded(record);
        } finally {
          if (mountedRef.current) setUploading(false);
        }
      }
      const msg = await sendMessage(convId, text, replyTo ? msgId(replyTo) : null, record ? [record.id] : undefined);
      // Upsert (not blind append): safe even if the socket echo arrived first.
      setMessages((prev) => mergeMessages(prev, [msg]));
      setComposer("");
      setAttachment(null);
      setUploaded(null);
      setReplyTo(null);
      setAttachError(null);
      newArrivedRef.current = false;
      setNewArrived(false);
      setTimeout(() => scrollToEnd(true), 80);
    } catch (e: any) {
      // Keep composer + staged/uploaded attachment so nothing is silently discarded.
      setSendError(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  }, [composer, attachment, uploaded, replyTo, sending, picking, uploading, convId, t, scrollToEnd]);

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
    const mid = msgId(m);
    // Double-submit protection: one in-flight delete at a time.
    if (!mid || deletingId) return;
    setDeletingId(mid);
    setDeleteError(null);
    try {
      await deleteMessage(mid);
      setMessages((prev) =>
        prev.map((x) => (msgId(x) === mid ? { ...x, isDeleted: true, deletedAt: Date.now(), content: "Message deleted", attachments: [] } : x)),
      );
      closeMenu();
    } catch (e: any) {
      // Menu stays open with a concise error; original message retained.
      if (mountedRef.current) setDeleteError(e?.message || "Delete failed");
    } finally {
      if (mountedRef.current) setDeletingId(null);
    }
  };

  const handleReact = async (m: any, emoji: string) => {
    const mid = msgId(m);
    if (reactingId) return; // serialize: one in-flight reaction at a time
    setReactingId(mid);
    try {
      const updated = await setReaction(mid, emoji);
      setMessages((prev) => prev.map((x) => (msgId(x) === mid ? updated : x)));
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Reaction failed");
    } finally {
      setReactingId(null);
    }
  };

  const openStrip = useCallback((m: any | null, anchorY?: number) => {
    setPickerCat("frequent");
    setPickerOpen(false);
    setStripAnchorY(typeof anchorY === "number" ? anchorY : null);
    setStripMsg(m);
  }, []);

  const cancelTap = useCallback((mid: string) => {
    const R = rowFx.current.get(mid);
    if (R?.tapTimer) clearTimeout(R.tapTimer);
    if (R) {
      R.tapTimer = null;
      R.tapTime = 0;
    }
  }, []);

  // Single/double-tap arbitration for one message: a first tap schedules its
  // action after the double-tap window; a second tap in-window cancels it and
  // opens the reaction strip instead.
  const registerTap = useCallback(
    (mid: string, action: (() => void) | null) => {
      const R = fx(mid);
      const now = Date.now();
      if (now - R.tapTime < DOUBLE_TAP_MS) {
        if (R.tapTimer) clearTimeout(R.tapTimer);
        R.tapTimer = null;
        R.tapTime = 0;
        const m = byIdRef.current.get(mid);
        if (!m) return;
        // Deleted messages have no reaction strip: fall back to the menu
        // (which offers Cancel only), never a usable selector.
        if (m.isDeleted || m.deletedAt) {
          setMenuMsg(m);
          return;
        }
        const v = R.view;
        try {
          v?.measureInWindow?.((x: number, y: number, w: number, h: number) => openStrip(m, y + h / 2));
        } catch {
          openStrip(m);
        }
        return;
      }
      R.tapTime = now;
      if (R.tapTimer) clearTimeout(R.tapTimer);
      R.tapTimer = setTimeout(() => {
        R.tapTimer = null;
        R.tapTime = 0;
        if (action) action();
      }, DOUBLE_TAP_MS);
    },
    [openStrip],
  );

  // Quick 🤝 = Messenger Like: a STANDALONE normal message containing only
  // 🤝, sent through the existing sendMessage path (never the reaction
  // endpoint, never attached to another message id).
  const handleQuickSend = useCallback(async () => {
    if (sending || picking || uploading) return;
    setSending(true);
    setSendError(null);
    try {
      const msg = await sendMessage(convId, QUICK_SEND_EMOJI, replyTo ? msgId(replyTo) : null);
      setMessages((prev) => mergeMessages(prev, [msg]));
      setReplyTo(null);
      newArrivedRef.current = false;
      setNewArrived(false);
      setTimeout(() => scrollToEnd(true), 80);
    } catch (e: any) {
      setSendError(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  }, [sending, picking, uploading, convId, replyTo, t, scrollToEnd]);

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

  const pinned = conv?.pinnedMessages || [];
  const byId = new Map(messages.map((m) => [msgId(m), m]));
  const byIdRef = useRef(new Map<string, any>());
  useEffect(() => {
    byIdRef.current = byId;
  });

  const activeParticipants = useMemo(
    () => (conv?.participants || []).filter((p: any) => !p?.leftAt),
    [conv],
  );
  const isGroup = useMemo(
    () => conv?.type === "group" || activeParticipants.length > 2,
    [conv, activeParticipants],
  );
  const senderInfo = useCallback(
    (accountId: string | undefined) => {
      const p = (conv?.participants || []).find((x: any) => x?.accountId === accountId);
      const acc = p?.account || {};
      return {
        name: acc.displayName || acc.tag || "…",
        tag: acc.tag || "",
        picture: acc.profilePicture || null,
      };
    },
    [conv],
  );

  const dayLabel = useCallback(
    (ms: number) => {
      const now = new Date();
      const d = new Date(ms);
      const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
      if (sameDay(d, now)) return t("conversation.today", "Today");
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      if (sameDay(d, y)) return t("conversation.yesterday", "Yesterday");
      return formatDate(ms, lang);
    },
    [lang, t],
  );

  const closeMenu = useCallback(() => {
    setMenuMsg(null);
    setConfirmDeleteId(null);
    setDeleteError(null);
  }, []);

  if (loading) return <Loading message="Loading conversation..." />;
  if (error) return <ErrorState title="Could not load chat" message={error} onRetry={load} />;

  const menuIsPinned = menuMsg ? pinned.some((p: any) => p.messageId === msgId(menuMsg)) : false;
  // Single source for "my active reaction" across strip, picker, and sheet.
  const stripMine = getMyReaction(stripMsg, myId);
  // Reaction strip placement: anchored near the pressed message when its
  // window position was measured (above/below by available space, kept inside
  // the viewport with room for the composer); centered fallback otherwise.
  const stripAbove = stripAnchorY != null && stripAnchorY > winHeight * 0.55;
  const stripTop =
    stripAnchorY == null ? 0 : stripAbove ? Math.max(60, stripAnchorY - 340) : Math.min(stripAnchorY + 12, winHeight - 380);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Compact dedicated header: Back + name + members. Preserved. */}
        <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
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
                <Pressable key={String(p.messageId)} style={styles.pinnedRow} onPress={() => scrollToMessage(String(p.messageId))}>
                  <Text style={[styles.pinnedText, { color: theme.colors.text }]} numberOfLines={1}>
                    {msg ? contentLabel(msg) || String(p.messageId) : String(p.messageId)}
                  </Text>
                  <Ionicons name="pin" size={12} color={theme.colors.warning} />
                </Pressable>
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
            initialNumToRender={25}
            scrollEventThrottle={16}
            // Older-page prepends keep visual position (no yank while reading).
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onScroll={(e) => {
              const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent;
              const dist = contentSize.height - (layoutMeasurement.height + contentOffset.y);
              nearBottomRef.current = dist < 120;
              if (nearBottomRef.current && newArrivedRef.current) {
                newArrivedRef.current = false;
                setNewArrived(false);
              }
            }}
            onContentSizeChange={() => {
              // First paint anchors near the newest message.
              if (!initialAnchoredRef.current && messages.length > 0) {
                initialAnchoredRef.current = true;
                setTimeout(() => scrollToEnd(false), 50);
              }
            }}
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
            renderItem={({ item, index }) => {
              const own = senderOf(item) === myId;
              const isDeleted = !!(item.isDeleted || item.deletedAt);
              const edited = item.editedAt && !isDeleted;
              const atts: any[] = Array.isArray(item.attachments) ? item.attachments : [];
              const replyOrig = item.replyToMessageId ? byId.get(String(item.replyToMessageId)) : null;
              const readByOthers = Array.isArray(item.readBy) && item.readBy.some((r: any) => r?.accountId && r.accountId !== myId);
              const isPinned = pinned.some((p: any) => p.messageId === msgId(item));
              const highlighted = highlightId === msgId(item);
              // Sender-run grouping (consecutive same-sender, same day).
              const prev = index > 0 ? messages[index - 1] : null;
              const next = index < messages.length - 1 ? messages[index + 1] : null;
              const sameAsPrev = !!prev && senderOf(prev) === senderOf(item) && dayKey(prev.createdAt || 0) === dayKey(item.createdAt || 0) && !prev.isDeleted;
              const sameAsNext = !!next && senderOf(next) === senderOf(item) && dayKey(next.createdAt || 0) === dayKey(item.createdAt || 0) && !item.isDeleted;
              const firstOfRun = !sameAsPrev;
              const lastOfRun = !sameAsNext;
              const info = senderInfo(senderOf(item));
              const showName = !own && isGroup && firstOfRun;
              const showDay = index === 0 || dayKey(messages[index - 1]?.createdAt || 0) !== dayKey(item.createdAt || 0);
              const groups = groupReactionCounts(item.reactions, myId);
              const hasReactions = groups.length > 0;
              // Cluster renders only on live messages (see below).
              const showCluster = hasReactions && !isDeleted;
              // Standalone quick-send (content exactly 🤝): large emoji, no
              // bubble chrome — still a normal message semantically.
              const isQuick = isQuickEmojiMessage(item);
              const mid = msgId(item);
              const F = fx(mid);
              // Swipe-to-reply driver (right-only, ownership-safe in RTL).
              // Claims the responder ONLY on horizontal-dominant movement, so
              // FlatList vertical scrolling stays perfectly smooth.
              const pan = PanResponder.create({
                onStartShouldSetPanResponder: () => false,
                onMoveShouldSetPanResponder: (_e, gs) => {
                  if (isDeleted || editingId === mid) return false;
                  return gs.dx > 18 && gs.dx > Math.abs(gs.dy) * 1.6;
                },
                onPanResponderGrant: () => {
                  F.fired = false;
                  cancelTap(mid);
                },
                onPanResponderMove: (_e, gs) => {
                  F.tx.setValue(Math.max(0, Math.min(64, gs.dx)));
                  if (gs.dx >= SWIPE_THRESHOLD && !F.fired) {
                    F.fired = true;
                    const original = byId.get(mid) || item;
                    setReplyTo(original);
                    Animated.spring(F.tx, { toValue: 0, useNativeDriver: true, speed: 26, bounciness: 0 }).start();
                  }
                },
                onPanResponderRelease: () => {
                  Animated.spring(F.tx, { toValue: 0, useNativeDriver: true, speed: 26, bounciness: 0 }).start();
                  F.fired = false;
                },
                onPanResponderTerminate: () => {
                  F.tx.setValue(0);
                  F.fired = false;
                  cancelTap(mid);
                },
              });
              // NOTE: row direction is ALWAYS conversation-semantic (own right,
              // incoming left) — never row-reversed for RTL. Only text aligns.
              return (
                <View>
                  {showDay ? (
                    <View style={styles.daySep}>
                      <Text style={[styles.daySepText, { color: theme.colors.textSecondary, backgroundColor: theme.colors.surfaceHover }]}>
                        {dayLabel(item.createdAt || 0)}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    ref={(v) => {
                      fx(mid).view = v || fx(mid).view;
                    }}
                    onLayout={(e) => rowY.current.set(mid, e.nativeEvent.layout.y)}
                    style={[styles.row, own ? styles.rowOwn : styles.rowIncoming, !firstOfRun && styles.rowGrouped]}
                    {...(Platform.OS === "web"
                      ? ({
                          onContextMenu: (e: any) => {
                            try {
                              e.preventDefault();
                            } catch {}
                            setMenuMsg(item);
                          },
                        } as any)
                      : null)}
                  >
                    {!own ? (
                      <View style={[styles.avatarSlot, showCluster && { marginBottom: 12 }]}>
                        {lastOfRun ? <Avatar uri={info.picture} name={info.name} size={30} /> : null}
                      </View>
                    ) : null}
                    {/* Bubble-anchored unit: name + swipe mover + absolute
                        cluster. The cluster positions against THIS wrapper
                        (the bubble), never the row or screen. */}
                    <View
                      style={[
                        styles.bubbleWrap,
                        own ? styles.bubbleWrapOwn : styles.bubbleWrapIncoming,
                        showCluster && { marginBottom: 12 },
                      ]}
                    >
                      {showName ? (
                        <Text style={[styles.senderName, { color: theme.colors.primary }]} numberOfLines={1}>
                          {info.name}
                        </Text>
                      ) : null}
                      <Animated.View
                        style={[
                          styles.swipeIcon,
                          { opacity: F.tx.interpolate({ inputRange: [18, 50], outputRange: [0, 1], extrapolate: "clamp" }) },
                        ]}
                        pointerEvents="none"
                      >
                        <Ionicons name="arrow-undo" size={18} color={theme.colors.primary} />
                      </Animated.View>
                      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: F.tx }] }}>
                        {isQuick ? (
                          // Quick 🤝: no bubble chrome, large standalone emoji.
                          <Pressable
                            onPress={() => registerTap(mid, null)}
                            onLongPress={() => setMenuMsg(item)}
                            delayLongPress={LONG_PRESS_MS}
                            style={styles.quickWrap}
                          >
                            {item.replyToMessageId && !isDeleted ? (
                              <Pressable
                                onPress={() => registerTap(mid, () => scrollToMessage(String(item.replyToMessageId)))}
                                onLongPress={() => setMenuMsg(item)}
                                delayLongPress={LONG_PRESS_MS}
                                style={[styles.quote, styles.quoteQuick, { borderLeftColor: theme.colors.primary }]}
                              >
                                <Text style={[styles.quoteName, { color: theme.colors.primary }]} numberOfLines={1}>
                                  {replyOrig ? senderInfo(senderOf(replyOrig)).name : "…"}
                                </Text>
                                <Text style={[styles.quoteText, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                                  {replyOrig ? contentLabel(replyOrig).slice(0, 80) : "…"}
                                </Text>
                              </Pressable>
                            ) : null}
                            <Text style={styles.quickEmoji} allowFontScaling={false}>
                              {QUICK_SEND_EMOJI}
                            </Text>
                            <Text style={[styles.meta, styles.metaQuick, { color: theme.colors.textTertiary }]}>
                              {formatTime(item.createdAt, lang)}
                              {edited ? ` · ${t("conversation.edited", "edited")}` : ""}
                              {isPinned ? "  📌" : ""}
                              {own ? (readByOthers ? "  ✓✓" : "  ✓") : ""}
                            </Text>
                          </Pressable>
                        ) : (
                        <Pressable
                          onPress={() => registerTap(mid, null)}
                          onLongPress={() => setMenuMsg(item)}
                          delayLongPress={LONG_PRESS_MS}
                          style={[
                            styles.bubble,
                            own ? styles.bubbleOwn : styles.bubbleIncoming,
                            {
                              backgroundColor: isDeleted ? theme.colors.surfaceHover : own ? theme.colors.primary : theme.colors.surface,
                            },
                            highlighted && { borderWidth: 2, borderColor: theme.colors.warning },
                          ]}
                        >
                          {item.replyToMessageId && !isDeleted ? (
                            <Pressable
                              onPress={() => registerTap(mid, () => scrollToMessage(String(item.replyToMessageId)))}
                              onLongPress={() => setMenuMsg(item)}
                              delayLongPress={LONG_PRESS_MS}
                              style={[styles.quote, { borderLeftColor: own ? "#FCF6EF" : theme.colors.primary }]}
                            >
                              <Text style={[styles.quoteName, { color: own ? "#FCF6EF" : theme.colors.primary }]} numberOfLines={1}>
                                {replyOrig ? senderInfo(senderOf(replyOrig)).name : "…"}
                              </Text>
                              <Text style={[styles.quoteText, { color: own ? "rgba(252,246,239,0.85)" : theme.colors.textSecondary }]} numberOfLines={2}>
                                {replyOrig ? contentLabel(replyOrig).slice(0, 80) : "…"}
                              </Text>
                            </Pressable>
                          ) : null}
                          {atts.map((a, idx) => {
                            // URL-based attachments only. Anything without an
                            // http(s) url is skipped, never rendered as binary.
                            const url = typeof a?.url === "string" && /^https?:\/\//i.test(a.url) ? a.url : null;
                            if (!url) return null;
                            if (a?.kind === "image") {
                              // JS-capped display box (bubble max width, 420px
                              // portrait cap): exact width/height keep the ratio
                              // so cover never crops meaningful content.
                              const aw = Number(a.width) > 0 ? Number(a.width) : 4;
                              const ah = Number(a.height) > 0 ? Number(a.height) : 3;
                              let dw = 232;
                              let dh = Math.round((232 * ah) / aw);
                              if (dh > 420) {
                                dh = 420;
                                dw = Math.round((420 * aw) / ah);
                              }
                              return (
                                <Pressable
                                  key={idx}
                                  onPress={() => registerTap(mid, () => setPreviewImg(url))}
                                  onLongPress={() => setMenuMsg(item)}
                                  delayLongPress={LONG_PRESS_MS}
                                  accessibilityLabel={t("conversation.openPreview", "Open preview")}
                                >
                                  <Image
                                    source={{ uri: url }}
                                    style={[styles.attachmentImage, { width: dw, height: dh }]}
                                    resizeMode="cover"
                                  />
                                </Pressable>
                              );
                            }
                            if (a?.kind === "video") {
                              // No native video player installed (expo-video
                              // would force a dev-client rebuild):
                              // system/browser playback via Linking.
                              return (
                                <Pressable
                                  key={idx}
                                  onPress={() =>
                                    registerTap(mid, () => {
                                      Linking.openURL(url).catch(() =>
                                        Alert.alert(
                                          t("conversation.videoAttachment", "Video attachment"),
                                          t("conversation.openVideoFailed", "Could not open video"),
                                        ),
                                      );
                                    })
                                  }
                                  onLongPress={() => setMenuMsg(item)}
                                  delayLongPress={LONG_PRESS_MS}
                                  style={[styles.videoBox, { backgroundColor: own ? "rgba(0,0,0,0.18)" : theme.colors.surfaceHover }]}
                                >
                                  <Ionicons name="play-circle" size={30} color={own ? "#FCF6EF" : theme.colors.primary} />
                                  <Text style={[styles.videoText, { color: own ? "#FCF6EF" : theme.colors.text }]} numberOfLines={1}>
                                    {t("conversation.openVideo", "Open video")}
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
                                style={[styles.editInput, { borderColor: own ? "rgba(252,246,239,0.5)" : theme.colors.border, color: own ? "#FCF6EF" : theme.colors.text }]}
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
                            <Text style={[styles.content, { color: own ? "#FCF6EF" : theme.colors.text, textAlign: rtl ? "right" : "left" }]}>
                              {item.content}
                            </Text>
                          ) : !isDeleted && atts.length === 0 ? (
                            <Text style={[styles.content, { color: own ? "#FCF6EF" : theme.colors.textSecondary }]}>
                              {contentLabel(item) || "…"}
                            </Text>
                          ) : null}
                          {isDeleted ? (
                            <Text style={[styles.content, { color: theme.colors.textTertiary, fontStyle: "italic" }]}>
                              {t("conversation.deleted", "Message deleted") as string}
                            </Text>
                          ) : null}
                          {!isDeleted && editingId !== msgId(item) ? (
                            <View style={styles.metaIn}>
                              <Text style={[styles.meta, { color: own ? "rgba(252,246,239,0.8)" : theme.colors.textTertiary }]}>
                                {formatTime(item.createdAt, lang)}
                                {edited ? ` · ${t("conversation.edited", "edited")}` : ""}
                                {isPinned ? "  📌" : ""}
                                {own ? (readByOthers ? "  ✓✓" : "  ✓") : ""}
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>
                        )}
                        </Animated.View>
                        {/* No cluster on deleted placeholders: reactions stay in
                            data (backend policy) but nothing floats on the
                            placeholder. */}
                        {showCluster ? (
                          <Pressable
                            onPress={() => registerTap(mid, () => setWhoMsg(item))}
                            onLongPress={() => setMenuMsg(item)}
                            delayLongPress={LONG_PRESS_MS}
                            style={[styles.cluster, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                          >
                            {groups.slice(0, 4).map((g) => (
                              <Text
                                key={g.emoji}
                                style={[
                                  styles.clusterText,
                                  g.mine && { color: theme.colors.primary, fontWeight: "800" },
                                ]}
                              >
                                {g.emoji}
                                {g.count > 1 ? ` ${g.count}` : ""}
                                {reactingId === msgId(item) ? "…" : ""}
                              </Text>
                            ))}
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              }}
          />
          {newArrived ? (
            <Pressable
              onPress={() => {
                newArrivedRef.current = false;
                setNewArrived(false);
                scrollToEnd(true);
              }}
              style={[styles.newChip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              <Text style={[styles.newChipText, { color: theme.colors.primary }]}>↓ {t("conversation.newMessages", "New messages")}</Text>
            </Pressable>
          ) : null}
          {typing ? (
            <View style={styles.typing}>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 11 }}>
                {typing} {t("conversation.typing", "typing...")}
              </Text>
            </View>
          ) : null}
          {replyTo ? (
            <View style={[styles.replyStrip, { backgroundColor: theme.colors.surfaceHover }]}>
              <View style={[styles.replyStripBar, { backgroundColor: theme.colors.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.replyStripName, { color: theme.colors.primary }]} numberOfLines={1}>
                  {senderInfo(senderOf(replyTo)).name}
                </Text>
                <Text style={[styles.replyStripText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                  {contentLabel(replyTo).slice(0, 80)}
                </Text>
              </View>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8} accessibilityLabel={t("conversation.cancel", "Cancel")}>
                <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}
          {attachment ? (
            <View style={[styles.previewBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
              {attachment.kind === "image" ? (
                <Image source={{ uri: attachment.localUri }} style={styles.previewThumb} />
              ) : (
                <View style={[styles.previewThumb, styles.previewVideo, { borderColor: theme.colors.border }]}>
                  <Ionicons name="videocam" size={18} color={theme.colors.primary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.previewLabel, { color: theme.colors.text }]} numberOfLines={1}>
                  {attachment.name}
                  {uploaded ? ` · ${t("conversation.ready", "Ready")}` : uploading ? ` · ${t("conversation.uploading", "Uploading…")}` : ""}
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
                <Ionicons name="close" size={15} color={theme.colors.text} />
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
          <View style={[styles.composer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
            <Pressable
              onPress={pickAttachment}
              disabled={picking || sending || uploading}
              accessibilityRole="button"
              accessibilityLabel={t("conversation.attach", "Attach photo or video")}
              style={[styles.attachBtn, { opacity: picking || sending || uploading ? 0.5 : 1 }]}
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
              onFocus={() => {
                if (nearBottomRef.current) setTimeout(() => scrollToEnd(true), 250);
              }}
              placeholder={t("conversation.messagePlaceholder", "Message… @tag supported")}
              style={[styles.input, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder, color: theme.colors.text }, rtl && { textAlign: "right" }]}
              placeholderTextColor={theme.colors.textTertiary}
              multiline
              maxLength={2000}
            />
            {(() => {
              // Empty composer + nothing staged = quick 🤝 (Messenger Like).
              // Any text or staged attachment = normal Send icon.
              const showQuick = !composer.trim() && !attachment && !uploaded;
              return (
                <Pressable
                  testID="chat-send-button"
                  accessibilityRole="button"
                  accessibilityLabel={showQuick ? QUICK_SEND_EMOJI : t("conversation.send", "Send")}
                  onPress={showQuick ? handleQuickSend : handleSend}
                  disabled={sending || picking || uploading || (!showQuick && !composer.trim() && !attachment && !uploaded)}
                  style={styles.sendBtn}
                >
                  {sending || uploading ? (
                    <ActivityIndicator color={theme.colors.primary} size="small" />
                  ) : showQuick ? (
                    <Text style={{ fontSize: 24 }}>🤝</Text>
                  ) : (
                    <Ionicons
                      name="send"
                      size={20}
                      color={composer.trim() || attachment || uploaded ? theme.colors.primary : theme.colors.textTertiary}
                      style={rtl && { transform: [{ scaleX: -1 }] } as any}
                    />
                  )}
                </Pressable>
              );
            })()}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Contextual message menu: long-press / ellipsis. Only permitted actions. */}
      <Modal visible={!!menuMsg} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.sheetBackdrop} onPress={closeMenu}>
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.sheetPreview, { color: theme.colors.textSecondary }]} numberOfLines={2}>
              {menuMsg ? contentLabel(menuMsg).slice(0, 100) : ""}
            </Text>
            {menuMsg && !menuMsg.isDeleted && !menuMsg.deletedAt ? (
              <>
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    const m = menuMsg;
                    closeMenu();
                    setReplyTo(m);
                  }}
                >
                  <Ionicons name="arrow-undo" size={18} color={theme.colors.text} />
                  <Text style={[styles.sheetLabel, { color: theme.colors.text }]}>{t("conversation.reply", "Reply")}</Text>
                </Pressable>
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    const m = menuMsg;
                    setMenuMsg(null);
                    openStrip(m);
                  }}
                >
                  <Text style={{ fontSize: 18 }}>❤️</Text>
                  <Text style={[styles.sheetLabel, { color: theme.colors.text }]}>{t("conversation.react", "React")}</Text>
                </Pressable>
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    const m = menuMsg;
                    closeMenu();
                    if (m) void handlePin(m);
                  }}
                >
                  <Ionicons name="pin" size={18} color={theme.colors.text} />
                  <Text style={[styles.sheetLabel, { color: theme.colors.text }]}>
                    {menuIsPinned ? t("conversation.unpin", "Unpin") : t("conversation.pin", "Pin")}
                  </Text>
                </Pressable>
                {menuMsg && canEdit(menuMsg) ? (
                  <Pressable
                    style={styles.sheetRow}
                    onPress={() => {
                      const m = menuMsg;
                      closeMenu();
                      setEditingId(msgId(m));
                      setEditText(m.content || "");
                    }}
                  >
                    <Ionicons name="pencil" size={18} color={theme.colors.text} />
                    <Text style={[styles.sheetLabel, { color: theme.colors.text }]}>{t("conversation.edit", "Edit")}</Text>
                  </Pressable>
                ) : null}
                {menuMsg && (senderOf(menuMsg) === myId || account?.role === "manager") ? (
                  confirmDeleteId === msgId(menuMsg) ? (
                    <View style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
                      <Text style={[styles.sheetLabel, { color: theme.colors.text }]}>
                        {t("conversation.deleteTitle", "Delete message?")}
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                        {t("conversation.deleteHint", "This message will be removed from the conversation.")}
                      </Text>
                      {deleteError ? (
                        <Text style={{ fontSize: 12, color: theme.colors.error }}>{deleteError}</Text>
                      ) : null}
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
                        <Pressable
                          onPress={() => {
                            setConfirmDeleteId(null);
                            setDeleteError(null);
                          }}
                          disabled={deletingId === msgId(menuMsg)}
                          style={[styles.smallBtn, { flex: 1, backgroundColor: theme.colors.surfaceHover, borderColor: theme.colors.border }]}
                        >
                          <Text style={[styles.smallBtnText, { color: theme.colors.text }]}>{t("conversation.cancel", "Cancel")}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            if (menuMsg) void handleDelete(menuMsg);
                          }}
                          disabled={deletingId === msgId(menuMsg)}
                          style={[styles.smallBtn, { flex: 1, backgroundColor: theme.colors.error, opacity: deletingId === msgId(menuMsg) ? 0.6 : 1 }]}
                        >
                          {deletingId === msgId(menuMsg) ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.smallBtnText}>{t("conversation.delete", "Delete")}</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.sheetRow}
                      onPress={() => {
                        setDeleteError(null);
                        setConfirmDeleteId(msgId(menuMsg));
                      }}
                    >
                      <Ionicons name="trash" size={18} color={theme.colors.error} />
                      <Text style={[styles.sheetLabel, { color: theme.colors.error }]}>{t("conversation.delete", "Delete")}</Text>
                    </Pressable>
                  )
                ) : null}
              </>
            ) : null}
            <Pressable style={[styles.sheetRow, styles.sheetCancel]} onPress={closeMenu}>
              <Text style={[styles.sheetLabel, { color: theme.colors.textSecondary, textAlign: "center", flex: 1 }]}>
                {t("conversation.cancel", "Cancel")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Instagram-style reaction strip: long-press opens it directly;
          the context menu's React row opens it too. + swaps to the full
          picker (same modal, pure-JS dataset, no native deps). */}
      <Modal visible={!!stripMsg} transparent animationType="fade" onRequestClose={() => setStripMsg(null)}>
        <Pressable style={styles.stripBackdrop} onPress={() => setStripMsg(null)}>
          <View style={stripAnchorY == null ? styles.stripCenter : [styles.stripFloat, { top: stripTop }]}>
          <View style={[styles.strip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.stripPreview, { color: theme.colors.textSecondary }]} numberOfLines={2}>
              {stripMsg ? contentLabel(stripMsg).slice(0, 100) : ""}
            </Text>
            <View style={styles.stripRow}>
              {QUICK_REACTIONS.map((emoji) => {
                const mine = emoji === stripMine;
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => {
                      const m = stripMsg;
                      setStripMsg(null);
                      if (m) void handleReact(m, emoji);
                    }}
                    style={[styles.stripEmoji, mine && { backgroundColor: theme.colors.primarySoft, borderRadius: 999 }]}
                    hitSlop={6}
                  >
                    <Text style={{ fontSize: 26 }} allowFontScaling={false}>
                      {emoji}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setPickerOpen((v) => !v)}
                style={[styles.stripPlus, { borderColor: theme.colors.border }]}
                hitSlop={6}
                accessibilityLabel="+"
              >
                <Ionicons name={pickerOpen ? "chevron-down" : "add"} size={20} color={theme.colors.text} />
              </Pressable>
            </View>
            {pickerOpen ? (
              <View style={styles.pickerWrap}>
                <View style={styles.pickerTabs}>
                  {REACTION_CATEGORIES.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setPickerCat(c.id)}
                      style={[styles.pickerTab, pickerCat === c.id && { backgroundColor: theme.colors.primarySoft, borderRadius: 999 }]}
                    >
                      <Text style={[styles.pickerTabText, { color: pickerCat === c.id ? theme.colors.primary : theme.colors.textSecondary }]}>
                        {c.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.pickerGrid}>
                  {(REACTION_CATEGORIES.find((c) => c.id === pickerCat)?.emojis || []).map((emoji) => (
                    <Pressable
                      key={emoji}
                      onPress={() => {
                        const m = stripMsg;
                        setStripMsg(null);
                        setPickerOpen(false);
                        setPickerCat("frequent");
                        if (m) void handleReact(m, emoji);
                      }}
                      style={[styles.pickerCell, emoji === stripMine && { backgroundColor: theme.colors.primarySoft, borderRadius: 8 }]}
                      hitSlop={2}
                    >
                      <Text style={{ fontSize: 24 }} allowFontScaling={false}>
                        {emoji}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            <Pressable
              style={[styles.sheetRow, styles.stripMore]}
              onPress={() => {
                const m = stripMsg;
                setStripMsg(null);
                setMenuMsg(m);
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.text} />
              <Text style={[styles.sheetLabel, { color: theme.colors.text }]}>{t("conversation.reply", "Reply")}…</Text>
            </Pressable>
          </View>
          </View>
        </Pressable>
      </Modal>

      {/* Who reacted: emoji + names from existing conversation accounts. */}
      <Modal visible={!!whoMsg} transparent animationType="fade" onRequestClose={() => setWhoMsg(null)}>
        <Pressable style={styles.stripBackdrop} onPress={() => setWhoMsg(null)}>
          <View style={[styles.strip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {(whoMsg?.reactions || []).map((r: any, i: number) => {
              const info = senderInfo(r?.accountId);
              const isMineRow = !!myId && r?.accountId === myId;
              // Own reaction row removes ONLY your reaction (server replaces
              // just your entry; everyone else's entries are untouched).
              return isMineRow ? (
                <Pressable
                  key={`${r?.accountId}-${r?.emoji}-${i}`}
                  style={styles.sheetRow}
                  onPress={() => {
                    const m = whoMsg;
                    const mine = getMyReaction(m, myId);
                    setWhoMsg(null);
                    if (m && mine) void handleReact(m, mine);
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{r?.emoji}</Text>
                  <Text style={[styles.sheetLabel, { color: theme.colors.text, flex: 1 }]} numberOfLines={1}>
                    {info.name} (you)
                  </Text>
                  <Text style={{ color: theme.colors.error, fontSize: 12, fontWeight: "700" }}>
                    {t("conversation.remove", "Remove")}
                  </Text>
                </Pressable>
              ) : (
                <View key={`${r?.accountId}-${r?.emoji}-${i}`} style={styles.sheetRow}>
                  <Text style={{ fontSize: 18 }}>{r?.emoji}</Text>
                  <Text style={[styles.sheetLabel, { color: theme.colors.text }]} numberOfLines={1}>
                    {info.name}
                  </Text>
                </View>
              );
            })}
            <Pressable style={[styles.sheetRow, styles.sheetCancel]} onPress={() => setWhoMsg(null)}>
              <Text style={[styles.sheetLabel, { color: theme.colors.textSecondary, textAlign: "center", flex: 1 }]}>
                {t("conversation.cancel", "Cancel")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

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
  // Compact dedicated header (Back + name + members). Preserved.
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    gap: 8,
    minHeight: 52,
  },
  backBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: "800" },
  subtitle: { fontSize: 11, marginTop: 1 },
  pinnedSection: { marginHorizontal: 10, marginTop: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1 },
  pinnedTitle: { fontWeight: "700", fontSize: 11, marginBottom: 2 },
  pinnedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingVertical: 3 },
  pinnedText: { fontSize: 12, flex: 1 },
  column: { flex: 1, width: "100%", alignSelf: "center" },
  columnWide: { maxWidth: 840 },
  listContent: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 10, flexGrow: 1 },
  loadOlder: { alignSelf: "center", borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, marginVertical: 8 },
  loadOlderText: { fontSize: 12, fontWeight: "700" },
  daySep: { alignItems: "center", marginVertical: 10 },
  daySepText: { fontSize: 11, fontWeight: "600", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  // Message rows: compact Messenger flow. Tighter inside a sender run,
  // breathing room on sender change. Semantic alignment on ALL languages.
  row: { flexDirection: "row", alignItems: "flex-end", marginTop: 10 },
  rowGrouped: { marginTop: 2 },
  rowOwn: { justifyContent: "flex-end" },
  rowIncoming: { justifyContent: "flex-start" },
  avatarSlot: { width: 30, marginRight: 7, alignItems: "center", justifyContent: "flex-end" },
  // Bubble-anchored unit: shrink-wrapped to the bubble itself. The reaction
  // cluster positions absolute against THIS wrapper — never row/screen.
  bubbleWrap: { position: "relative", flexShrink: 1, maxWidth: "80%" },
  bubbleWrapOwn: { alignSelf: "flex-end" },
  bubbleWrapIncoming: { alignSelf: "flex-start" },
  swipeIcon: { position: "absolute", left: -30, top: "50%", marginTop: -11, width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  senderName: { fontSize: 11, fontWeight: "700", marginBottom: 3, marginLeft: 10 },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 1 },
  bubbleOwn: {},
  bubbleIncoming: { borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  content: { fontSize: 14, lineHeight: 19 },
  // Standalone quick-send: no bubble chrome, Messenger Like-style.
  quickWrap: { alignItems: "flex-end", paddingVertical: 2 },
  quickEmoji: { fontSize: 38, lineHeight: 44 },
  metaQuick: { marginTop: 2 },
  quote: { borderLeftWidth: 3, borderRadius: 4, paddingLeft: 8, paddingVertical: 4, marginBottom: 6, backgroundColor: "rgba(0,0,0,0.08)" },
  quoteQuick: { marginBottom: 4, minWidth: 120 },
  quoteName: { fontSize: 11, fontWeight: "800" },
  quoteText: { fontSize: 12, marginTop: 1 },
  attachmentImage: { borderRadius: 12, marginBottom: 4, backgroundColor: "#00000010" },
  videoBox: { width: 220, maxWidth: "100%", borderRadius: 12, marginBottom: 4, paddingVertical: 16, paddingHorizontal: 12, alignItems: "center", gap: 4 },
  videoText: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  // Reaction cluster: tiny pill overlapping the bubble's lower edge,
  // anchored absolute to the bubble wrapper. Nothing at zero reactions.
  cluster: {
    position: "absolute",
    bottom: -9,
    right: 10,
    zIndex: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 24,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  clusterText: { fontSize: 12, fontWeight: "600" },
  // Subtle in-bubble metadata (time · edited · pin · receipts).
  metaIn: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3 },
  meta: { fontSize: 10 },
  typing: { paddingVertical: 4, paddingHorizontal: 12, alignItems: "flex-start" },
  newChip: { alignSelf: "center", borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, marginVertical: 6 },
  newChipText: { fontSize: 12, fontWeight: "700" },
  replyStrip: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 10, marginBottom: 6, borderRadius: 10, padding: 8 },
  replyStripBar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  replyStripName: { fontSize: 11, fontWeight: "800" },
  replyStripText: { fontSize: 12, marginTop: 1 },
  // Compact staging preview (~64px): thumbnail + name + remove.
  previewBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderTopWidth: 1, minHeight: 60, maxHeight: 76 },
  previewThumb: { width: 44, height: 44, borderRadius: 8 },
  previewVideo: { borderWidth: 1, alignItems: "center", justifyContent: "center" },
  previewLabel: { fontSize: 12, fontWeight: "600" },
  previewError: { fontSize: 11, marginTop: 2 },
  previewRemove: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  inlineError: { paddingHorizontal: 12, paddingVertical: 6 },
  inlineErrorText: { fontSize: 11, fontWeight: "600" },
  // Compact Messenger-style composer (~48-56px at rest).
  composer: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingVertical: 6, borderTopWidth: 1, gap: 6, minHeight: 52 },
  attachBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, borderWidth: 1, borderRadius: 19, paddingHorizontal: 13, paddingVertical: 8, fontSize: 14, maxHeight: 100, minHeight: 38 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  editInput: { borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 13, minHeight: 40, minWidth: 140 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  smallBtnText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 20 },
  sheetPreview: { fontSize: 12, paddingHorizontal: 12, paddingBottom: 8 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  sheetLabel: { fontSize: 14, fontWeight: "600" },
  sheetCancel: { marginTop: 4, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" },
  // Instagram-style reaction strip: floating card, quick six + full picker.
  stripBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 20 },
  // Centered fallback (no anchor measured) vs anchored-near-message card.
  stripCenter: { width: "100%", maxWidth: 360 },
  stripFloat: { position: "absolute", left: 20, right: 20 },
  strip: { width: "100%", maxWidth: 360, borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8 },
  stripPreview: { fontSize: 12, paddingHorizontal: 6, paddingBottom: 6 },
  stripRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  stripEmoji: { paddingHorizontal: 4, paddingVertical: 6 },
  stripPlus: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stripMore: { marginTop: 4, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" },
  pickerWrap: { marginTop: 6, maxHeight: 300 },
  pickerTabs: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 6 },
  pickerTab: { paddingHorizontal: 10, paddingVertical: 5 },
  pickerTabText: { fontSize: 11, fontWeight: "700" },
  pickerGrid: { flexDirection: "row", flexWrap: "wrap" },
  pickerCell: { width: "12.5%", alignItems: "center", paddingVertical: 6 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalBody: { width: "100%", maxWidth: 640, alignItems: "center", gap: 12 },
  modalImage: { width: "100%", height: 420, borderRadius: 12 },
  modalClose: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
});
