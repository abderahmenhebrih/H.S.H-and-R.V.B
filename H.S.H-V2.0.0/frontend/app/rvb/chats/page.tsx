"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RvbShell from "../../../src/components/rvb/RvbShell";
import { rvbUiPreferencesService, RVB_UI_PREFERENCES_EVENT } from "@/src/services/rvb-ui-preferences.service";
import { DEFAULT_SETTINGS } from "../../../src/lib/settings";
import type { Settings, Language } from "../../../src/types/settings/settings";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import RvbAuthGuard from "../../../src/components/rvb/RvbAuthGuard";
import { rvbAccountService } from "../../../src/services/rvb-account.service";
import type { RvbAccount } from "../../../src/types/rvb/rvb-account";
import { chatService, messagePreview, type Conversation, type Message, type ChatAttachment } from "../../../src/services/chat.service";
import { connectChatSocket, getChatSocket } from "../../../src/services/chat-socket.service";
import { Search, MessagesSquare, Send, Pin, MoreVertical, LogOut, Users, UserPlus, X, CornerUpLeft, Handshake, CheckCheck, Edit3, Trash2, Eye, Clock, AlertTriangle, Paperclip } from "lucide-react";
import styles from "./page.module.css";

const TR: Record<Language, any> = {
  en: {
    chats: "Chats",
    main: "Main Chats",
    secondary: "Secondary Chats",
    newChat: "New Chat",
    newMessage: "New Message",
    newGroup: "New Group",
    searchChats: "Search chats",
    searchPlaceholder: "Search by name, @tag or group",
    noConversations: "No conversations yet",
    noMain: "No main chats available.",
    noSecondary: "No secondary chats yet.",
    startNew: "Start a new chat",
    officialGroups: "Official Groups",
    officialPrivate: "Official Private",
    dms: "Direct Messages",
    groups: "Groups",
    members: "Members",
    pinnedMessages: "Pinned Messages",
    leaveGroup: "Leave Group",
    renameGroup: "Rename group",
    addMembers: "Add members",
    message: "Message",
    reply: "Reply",
    edited: "Edited",
    deleted: "Message deleted",
    pinned: "Pinned",
    typing: "is typing…",
    enterToSend: "Press Enter to send, Shift+Enter for new line",
    emptyMessage: "Message cannot be empty",
    send: "Send",
    searchMessages: "Search messages",
    online: "Online",
    lastSeen: "Last seen",
    noMessages: "No messages yet. Say hello!",
    loadOlder: "Load older messages",
    errorLoad: "Failed to load",
    retry: "Retry",
    edit: "Edit",
    delete: "Delete",
    pin: "Pin",
    unpin: "Unpin",
    react: "React 🤝",
    readBy: "Read by",
    copy: "Copy",
    audit: "Audit",
    reminder: "Reminder",
    reminder30: "30 minutes",
    reminder60: "60 minutes",
    reminder120: "120 minutes",
    mentionHint: "Mentions: @workers @suppliers @customers @managers @everyone",
    attach: "Attach photo or video",
    attachRemove: "Remove attachment",
    uploading: "Uploading…",
    uploadFailed: "Upload failed. Retry or remove the attachment.",
    imageLabel: "Image",
    videoLabel: "Video",
    openVideo: "Open video",
    mediaTooLarge: "File too large (images 8 MB, videos 25 MB max)",
    mediaBadType: "Unsupported file (jpeg/png/webp/mp4/mov/webm only)",
    emptyAttach: "Write a message or attach media",
    ready: "Ready",
    officialBadge: "Official",
    admin: "Admin",
    manager: "Manager",
    supervisor: "Supervisor",
    worker: "Worker",
    supplier: "Supplier",
    customer: "Customer",
    createGroup: "Create group",
    groupName: "Group name",
    selectMembers: "Select members",
    cancel: "Cancel",
    create: "Create",
    dirSearch: "Search directory by name, @tag or role",
    all: "All",
    noDirectory: "No accounts found",
    back: "Back",
    details: "Details",
    info: "Conversation info",
    maxPinned: "Maximum 3 pinned messages per conversation",
    editWindow: "Editing allowed for 15 minutes after sending",
    archivedCannotSend: "Archived account cannot send messages",
    historyRemains: "Historical messages remain",
    socketDisconnected: "Disconnected — reconnecting…",
  },
  fr: {
    chats: "Discussions",
    main: "Discussions principales",
    secondary: "Discussions secondaires",
    newChat: "Nouvelle discussion",
    newMessage: "Nouveau message",
    newGroup: "Nouveau groupe",
    searchChats: "Rechercher",
    searchPlaceholder: "Rechercher par nom, @tag ou groupe",
    noConversations: "Aucune discussion",
    noMain: "Aucune discussion principale.",
    noSecondary: "Aucune discussion secondaire.",
    startNew: "Démarrer une discussion",
    officialGroups: "Groupes officiels",
    officialPrivate: "Privé officiel",
    dms: "Messages directs",
    groups: "Groupes",
    members: "Membres",
    pinnedMessages: "Messages épinglés",
    leaveGroup: "Quitter le groupe",
    renameGroup: "Renommer",
    addMembers: "Ajouter membres",
    message: "Message",
    reply: "Répondre",
    edited: "Modifié",
    deleted: "Message supprimé",
    pinned: "Épinglé",
    typing: "est en train d'écrire…",
    enterToSend: "Entrée pour envoyer, Maj+Entrée nouvelle ligne",
    emptyMessage: "Message vide",
    send: "Envoyer",
    searchMessages: "Rechercher messages",
    online: "En ligne",
    lastSeen: "Vu dernièrement",
    noMessages: "Aucun message. Dites bonjour !",
    loadOlder: "Charger anciens messages",
    errorLoad: "Échec chargement",
    retry: "Réessayer",
    edit: "Modifier",
    delete: "Supprimer",
    pin: "Épingler",
    unpin: "Désépingler",
    react: "Réagir 🤝",
    readBy: "Lu par",
    copy: "Copier",
    audit: "Audit",
    reminder: "Rappel",
    reminder30: "30 minutes",
    reminder60: "60 minutes",
    reminder120: "120 minutes",
    mentionHint: "Mentions: @workers @suppliers @customers @managers @everyone",
    officialBadge: "Officiel",
    attach: "Joindre photo ou vidéo",
    attachRemove: "Retirer la pièce jointe",
    uploading: "Envoi en cours…",
    uploadFailed: "Échec de l'envoi. Réessayez ou retirez la pièce jointe.",
    imageLabel: "Image",
    videoLabel: "Vidéo",
    openVideo: "Ouvrir la vidéo",
    mediaTooLarge: "Fichier trop volumineux (images 8 Mo, vidéos 25 Mo max)",
    mediaBadType: "Fichier non pris en charge (jpeg/png/webp/mp4/mov/webm)",
    emptyAttach: "Écrivez un message ou joignez un média",
    ready: "Prêt",
    admin: "Admin",
    manager: "Manager",
    supervisor: "Superviseur",
    worker: "Travailleur",
    supplier: "Fournisseur",
    customer: "Client",
    createGroup: "Créer groupe",
    groupName: "Nom du groupe",
    selectMembers: "Sélectionner membres",
    cancel: "Annuler",
    create: "Créer",
    dirSearch: "Rechercher annuaire",
    all: "Tous",
    noDirectory: "Aucun compte",
    back: "Retour",
    details: "Détails",
    info: "Infos conversation",
    maxPinned: "Maximum 3 messages épinglés",
    editWindow: "Modification 15 minutes après envoi",
    archivedCannotSend: "Compte archivé ne peut envoyer",
    historyRemains: "Historique conservé",
    socketDisconnected: "Déconnecté — reconnexion…",
  },
  ar: {
    chats: "المحادثات",
    main: "المحادثات الرئيسية",
    secondary: "المحادثات الثانوية",
    newChat: "محادثة جديدة",
    newMessage: "رسالة جديدة",
    newGroup: "مجموعة جديدة",
    searchChats: "بحث",
    searchPlaceholder: "ابحث بالاسم، @tag أو المجموعة",
    noConversations: "لا توجد محادثات",
    noMain: "لا توجد محادثات رئيسية.",
    noSecondary: "لا توجد محادثات ثانوية.",
    startNew: "ابدأ محادثة جديدة",
    officialGroups: "المجموعات الرسمية",
    officialPrivate: "خاص رسمي",
    dms: "رسائل مباشرة",
    groups: "مجموعات",
    members: "الأعضاء",
    pinnedMessages: "الرسائل المثبتة",
    leaveGroup: "مغادرة المجموعة",
    renameGroup: "إعادة تسمية",
    addMembers: "إضافة أعضاء",
    message: "رسالة",
    reply: "رد",
    edited: "تم التعديل",
    deleted: "تم حذف الرسالة",
    pinned: "مثبت",
    typing: "يكتب…",
    enterToSend: "Enter للإرسال، Shift+Enter سطر جديد",
    emptyMessage: "لا يمكن إرسال رسالة فارغة",
    send: "إرسال",
    searchMessages: "بحث الرسائل",
    online: "متصل",
    lastSeen: "آخر ظهور",
    noMessages: "لا توجد رسائل. قل مرحبا!",
    loadOlder: "تحميل رسائل أقدم",
    errorLoad: "فشل التحميل",
    retry: "إعادة",
    edit: "تعديل",
    delete: "حذف",
    pin: "تثبيت",
    unpin: "إلغاء التثبيت",
    react: "تفاعل 🤝",
    readBy: "قرأها",
    copy: "نسخ",
    audit: "تدقيق",
    reminder: "تذكير",
    reminder30: "٣٠ دقيقة",
    reminder60: "٦٠ دقيقة",
    reminder120: "١٢٠ دقيقة",
    mentionHint: "إشارات: @workers @suppliers @customers @managers @everyone",
    attach: "إرفاق صورة أو فيديو",
    attachRemove: "إزالة المرفق",
    uploading: "جارٍ الرفع…",
    uploadFailed: "فشل الرفع. أعد المحاولة أو أزل المرفق.",
    imageLabel: "صورة",
    videoLabel: "فيديو",
    openVideo: "فتح الفيديو",
    mediaTooLarge: "الملف كبير جدًا (الصور 8MB، الفيديو 25MB كحد أقصى)",
    mediaBadType: "ملف غير مدعوم (jpeg/png/webp/mp4/mov/webm فقط)",
    emptyAttach: "اكتب رسالة أو أرفق وسائط",
    ready: "جاهز",
    officialBadge: "رسمي",
    admin: "مسؤول",
    manager: "مدير",
    supervisor: "مشرف",
    worker: "عامل",
    supplier: "مورد",
    customer: "زبون",
    createGroup: "إنشاء مجموعة",
    groupName: "اسم المجموعة",
    selectMembers: "اختر الأعضاء",
    cancel: "إلغاء",
    create: "إنشاء",
    dirSearch: "ابحث في الدليل",
    all: "الكل",
    noDirectory: "لا يوجد حسابات",
    back: "رجوع",
    details: "التفاصيل",
    info: "معلومات المحادثة",
    maxPinned: "الحد الأقصى ٣ رسائل مثبتة",
    editWindow: "التعديل خلال ١٥ دقيقة",
    archivedCannotSend: "الحساب المؤرشف لا يمكنه الإرسال",
    historyRemains: "السجل محفوظ",
    socketDisconnected: "انقطع الاتصال — إعادة المحاولة…",
  },
} as const;

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function formatTime(ts: number, lang: string) {
  try {
    const locale = lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB";
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", numberingSystem: "latn" } as any).format(new Date(ts));
  } catch { return new Date(ts).toLocaleTimeString(); }
}
function formatDateShort(ts: number, lang: string) {
  try {
    const locale = lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB";
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", numberingSystem: "latn" } as any).format(new Date(ts));
  } catch { return new Date(ts).toLocaleDateString(); }
}

function getConversationDisplayName(conv: Conversation, myId: string, t: any): string {
  if (conv.type === "official_group") {
    if (conv.officialKind === "workers_group") return "Workers";
    if (conv.officialKind === "suppliers_group") return "Suppliers";
    if (conv.officialKind === "customers_group") return "Customers";
    return conv.name || "Group";
  }
  if (conv.type === "official_private") {
    const other = (conv.participants as any[]).find((p: any) => p.accountId !== myId);
    return other?.account?.displayName || other?.account?.tag || "Official Chat";
  }
  if (conv.type === "dm") {
    const other = (conv.participants as any[]).find((p: any) => p.accountId !== myId);
    return other?.account?.displayName || other?.account?.tag || "Direct Message";
  }
  return conv.name || "Group";
}

function ChatsInner() {
  const { user } = useRvbAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const lang = (settings.language as Language) || "en";
  const t = (TR as any)[lang] ?? TR.en;
  const isRtl = lang === "ar";
  const myId = (user as any)?.accountId || (user as any)?.id || "";

  const [category, setCategory] = useState<"main" | "secondary">("main");

  // Deep-link handling: ?category=main|secondary
  useEffect(() => {
    const cat = searchParams.get("category");
    if (cat === "secondary" || cat === "main") {
      setCategory(cat);
    } else {
      setCategory("main");
    }
  }, [searchParams]);

  const handleCategoryChange = (cat: "main" | "secondary") => {
    setCategory(cat);
    try {
      const params = new URLSearchParams(searchParams.toString());
      params.set("category", cat);
      router.replace(`/rvb/chats?${params.toString()}`);
    } catch {}
  };
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [convError, setConvError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [composer, setComposer] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [pinnedExpanded, setPinnedExpanded] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [socketConnected, setSocketConnected] = useState(true);
  const [showNewChat, setShowNewChat] = useState<null | "choice" | "dm" | "group">(null);
  const [dirAccounts, setDirAccounts] = useState<RvbAccount[]>([]);
  const [dirSearch, setDirSearch] = useState("");
  const [dirRole, setDirRole] = useState("all");
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [reminderChoice, setReminderChoice] = useState<number | null>(null);
  const [auditData, setAuditData] = useState<any | null>(null);
  const [messageSearch, setMessageSearch] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);
  // Staged media: local File previewed instantly, uploaded as multipart binary
  // at send time (never base64). uploadedAttachment survives a failed send so
  // retry reuses the same upload id without sending bytes twice.
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedUrl, setStagedUrl] = useState<string | null>(null);
  const [uploadedAttachment, setUploadedAttachment] = useState<ChatAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);
  const [videoFailed, setVideoFailed] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<any>(null);

  // Settings
  useEffect(() => {
    rvbUiPreferencesService.get().then((s) => { if (s) setSettings(s); });
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) setSettings(ce.detail);
    };
    window.addEventListener(RVB_UI_PREFERENCES_EVENT, h as any);
    return () => window.removeEventListener(RVB_UI_PREFERENCES_EVENT, h as any);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const loadConversations = useCallback(async () => {
    setLoadingConvs(true);
    setConvError("");
    try {
      const convs = await chatService.list(category, debouncedSearch || undefined);
      setConversations(convs);
    } catch (e: any) {
      setConvError(e?.data?.code || e?.message || t.errorLoad);
    } finally { setLoadingConvs(false); }
  }, [category, debouncedSearch, t.errorLoad]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // Keep filtered for section split (for main, split groups vs private)
  useEffect(() => { setFilteredConversations(conversations); }, [conversations]);

  const loadMessages = useCallback(async (convId: string, before?: number, append = false, search?: string) => {
    setMessagesLoading(true);
    setMessagesError("");
    try {
      const msgs = await chatService.listMessages(convId, { before, limit: 30, search });
      if (append) {
        // Prepend older
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const filtered = msgs.filter((m) => !existingIds.has(m.id));
          return [...filtered, ...prev];
        });
        setHasMore(msgs.length === 30);
      } else {
        setMessages(msgs);
        setHasMore(msgs.length === 30);
        // Mark read
        setTimeout(() => {
          if (msgs.length) chatService.markRead(convId, msgs[msgs.length - 1].id).catch(() => {});
        }, 400);
        // Scroll to bottom
        setTimeout(() => {
          if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }, 80);
      }
    } catch (e: any) {
      setMessagesError(e?.data?.code || e?.message || t.errorLoad);
    } finally { setMessagesLoading(false); }
  }, [t.errorLoad]);

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    setMobileShowChat(true);
    setReplyTo(null);
    setEditing(null);
    setMessageSearch("");
    clearStaged();
    try {
      const conv = await chatService.get(id);
      setSelectedConv(conv);
      await loadMessages(id);
      // Join socket room
      const sock = getChatSocket();
      sock?.emit("chat:join", { conversationId: id });
    } catch (e: any) {
      setSelectedConv(null);
    }
  };

  // Socket setup
  useEffect(() => {
    const sock = connectChatSocket();
    if (!sock) return;
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onNewMessage = (data: any) => {
      const msg: Message = data.message;
      const convId = data.conversationId || msg.conversationId;
      // If message for selected conv, append
      if (convId === selectedId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setTimeout(() => {
          if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }, 40);
        // Mark read if we are viewing
        chatService.markRead(convId, msg.id).catch(() => {});
      }
      // Update conversation preview and resort (shared preview semantics:
      // text preferred, media-only shows [Image]/[Video], never blank/URL).
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === convId);
        if (idx >= 0) {
          const copy = [...prev];
          const conv: any = { ...copy[idx], lastMessageAt: msg.createdAt, lastMessagePreview: messagePreview(msg.content, msg.attachments), lastMessageSenderId: msg.senderAccountId, updatedAt: Date.now() };
          copy.splice(idx, 1);
          copy.unshift(conv);
          return copy;
        }
        return prev;
      });
      // Refresh list occasionally
      void loadConversations();
    };
    const onEdited = (data: any) => {
      const m = data.message;
      if (m.conversationId === selectedId) setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    };
    const onDeleted = (data: any) => {
      if (data.conversationId === selectedId) setMessages((prev) => prev.map((m) => (m.id === data.messageId ? { ...m, isDeleted: true, content: "Message deleted", deletedAt: Date.now() } : m)));
    };
    const onReaction = (data: any) => {
      const m = data.message;
      if (m.conversationId === selectedId) setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    };
    const onRead = (data: any) => {
      // Could update read receipts locally: not critical
    };
    const onTyping = (data: any) => {
      if (data.conversationId !== selectedId) return;
      if (data.isTyping) setTypingUsers((prev) => ({ ...prev, [data.accountId]: data.tag || data.accountId }));
      else setTypingUsers((prev) => {
        const copy = { ...prev };
        delete copy[data.accountId];
        return copy;
      });
      if (data.isTyping) {
        setTimeout(() => setTypingUsers((prev) => {
          const copy = { ...prev }; delete copy[data.accountId]; return copy;
        }), 3000);
      }
    };
    const onPinned = () => { if (selectedId) chatService.get(selectedId).then((c) => setSelectedConv(c)).catch(() => {}); };
    const onUnread = () => void loadConversations();

    sock.on("connect", onConnect);
    sock.on("disconnect", onDisconnect);
    sock.on("chat:newMessage", onNewMessage);
    sock.on("chat:messageEdited", onEdited);
    sock.on("chat:messageDeleted", onDeleted);
    sock.on("chat:reactionUpdated", onReaction);
    sock.on("chat:readReceipt", onRead);
    sock.on("chat:typing", onTyping);
    sock.on("chat:pinnedUpdated", onPinned);
    sock.on("chat:unreadUpdate", onUnread);

    return () => {
      sock.off("connect", onConnect);
      sock.off("disconnect", onDisconnect);
      sock.off("chat:newMessage", onNewMessage);
      sock.off("chat:messageEdited", onEdited);
      sock.off("chat:messageDeleted", onDeleted);
      sock.off("chat:reactionUpdated", onReaction);
      sock.off("chat:readReceipt", onRead);
      sock.off("chat:typing", onTyping);
      sock.off("chat:pinnedUpdated", onPinned);
      sock.off("chat:unreadUpdate", onUnread);
    };
  }, [selectedId, loadConversations]);

  const clearStaged = useCallback(() => {
    setStagedUrl((prev) => {
      if (prev) {
        try { URL.revokeObjectURL(prev); } catch {}
      }
      return null;
    });
    setStagedFile(null);
    setUploadedAttachment(null);
    setAttachError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => () => {
    if (stagedUrl) {
      try { URL.revokeObjectURL(stagedUrl); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = (f: File | null) => {
    setAttachError("");
    if (!f) return;
    const mime = (f.type || "").toLowerCase().split(";")[0].trim();
    const isImage = ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mime);
    const isVideo = ["video/mp4", "video/quicktime", "video/webm"].includes(mime);
    if (!isImage && !isVideo) {
      setAttachError(t.mediaBadType);
      return;
    }
    const cap = isImage ? 8 * 1024 * 1024 : 25 * 1024 * 1024;
    if (f.size <= 0 || f.size > cap) {
      setAttachError(t.mediaTooLarge);
      return;
    }
    // New selection replaces the previous staged upload (no re-upload needed
    // confusion: the old upload id stays valid server-side for orphan cleanup).
    clearStaged();
    setStagedFile(f);
    try {
      setStagedUrl(URL.createObjectURL(f));
    } catch {
      setStagedUrl(null);
    }
  };

  const handleSend = async () => {
    const text = composer.trim();
    if ((!text && !stagedFile && !uploadedAttachment) || !selectedId) return;
    if (text.length > 2000) { alert("Message too long"); return; }
    // Check archived cannot send: backend will reject, but disable UI if user archived? user is active via auth
    const trimmed = text;
    // Reminder handling — server-trusted minutes (30|60|120)
    const reminderMinutes: number | null = reminderChoice && [30, 60, 120].includes(Number(reminderChoice)) ? Number(reminderChoice) : null;
    // Optimistic: clear composer
    const prevComposer = composer;
    setComposer("");
    setReplyTo(null);
    setReminderChoice(null);
    setSending(true);
    setAttachError("");
    // Preserve scroll anchor? For now append optimistically after server confirms
    try {
      // Upload bytes first (multipart binary). A completed upload is retained:
      // if the message send below fails, retry reuses the same upload id.
      let record = uploadedAttachment;
      if (stagedFile && !record) {
        setUploading(true);
        try {
          record = await chatService.uploadAttachment(selectedId, stagedFile);
          setUploadedAttachment(record);
        } finally {
          setUploading(false);
        }
      }
      const sent = editing
        ? await chatService.editMessage(editing.id, trimmed)
        : await chatService.sendMessage(selectedId, trimmed, replyTo?.id || null, reminderMinutes, record ? [record.id] : undefined);
      if (editing) {
        setMessages((prev) => prev.map((m) => (m.id === sent.id ? sent : m)));
        setEditing(null);
      } else {
        // Socket will also emit, but to avoid duplicate we append if not exists
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
        setTimeout(() => {
          if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }, 40);
      }
      // Clear typing
      getChatSocket()?.emit("chat:typing", { conversationId: selectedId, isTyping: false });
      clearStaged();
      void loadConversations();
    } catch (e: any) {
      setComposer(prevComposer);
      // Keep staged/uploaded media so retry reuses the upload id.
      setAttachError(e?.data?.code || e?.message ? String(e?.data?.code || e?.message) : t.uploadFailed);
      alert(e?.data?.code || e?.message || "Send failed");
    } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    } else {
      // typing indicator throttled
      const sock = getChatSocket();
      if (sock && selectedId) {
        sock.emit("chat:typing", { conversationId: selectedId, isTyping: true });
        clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => sock.emit("chat:typing", { conversationId: selectedId, isTyping: false }), 1200);
      }
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop < 40 && hasMore && !messagesLoading && selectedId) {
      const oldest = messages[0]?.createdAt;
      if (oldest) {
        const before = oldest;
        const prevHeight = el.scrollHeight;
        void (async () => {
          await loadMessages(selectedId, before, true, messageSearch || undefined);
          requestAnimationFrame(() => {
            const newHeight = el.scrollHeight;
            el.scrollTop = newHeight - prevHeight + el.scrollTop;
          });
        })();
      }
    }
  };

  const handleEditClick = (m: Message) => {
    const age = Date.now() - m.createdAt;
    if (age > 15 * 60 * 1000) { alert(t.editWindow); return; }
    setEditing(m);
    setComposer(m.content);
    composerRef.current?.focus();
  };
  const handleDelete = async (m: Message) => {
    if (!confirm("Delete message?")) return;
    try {
      await chatService.deleteMessage(m.id);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, isDeleted: true, content: t.deleted } : x)));
    } catch (e: any) { alert(e?.message || "Delete failed"); }
  };
  const handleReaction = async (m: Message) => {
    try {
      const updated = await chatService.toggleReaction(m.id);
      setMessages((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch {}
  };
  const handlePin = async (m: Message) => {
    if (!selectedId) return;
    const isPinned = selectedConv?.pinnedMessages?.some((p) => p.messageId === m.id);
    try {
      const conv = isPinned ? await chatService.unpin(selectedId, m.id) : await chatService.pin(selectedId, m.id);
      setSelectedConv(conv);
    } catch (e: any) {
      alert(e?.data?.code === "RVB_PIN_LIMIT" ? t.maxPinned : e?.message || "Pin failed");
    }
  };
  const handleLeave = async () => {
    if (!selectedId || !selectedConv || selectedConv.isSystemManaged) return;
    if (!confirm(t.leaveGroup + "?")) return;
    try {
      await chatService.leave(selectedId);
      setSelectedId(null); setSelectedConv(null); setMessages([]);
      void loadConversations();
    } catch (e: any) { alert(e?.message || "Leave failed"); }
  };

  // Directory load for new chat
  useEffect(() => {
    if (showNewChat === "dm" || showNewChat === "group") {
      rvbAccountService.getAll().then((accs) => setDirAccounts(accs.filter((a) => a.status === "active"))).catch(() => setDirAccounts([]));
    }
  }, [showNewChat]);

  const filteredDir = useMemo(() => {
    const q = dirSearch.trim().toLowerCase();
    return dirAccounts.filter((a) => {
      if (dirRole !== "all" && a.role !== dirRole) return false;
      if (!q) return true;
      const nq = q.startsWith("@") ? q.slice(1) : q;
      return a.displayName.toLowerCase().includes(q) || a.tag.toLowerCase().includes(nq) || a.role.toLowerCase().includes(q);
    }).slice(0, 50);
  }, [dirAccounts, dirSearch, dirRole]);

  const openDM = async (otherId: string) => {
    try {
      const conv = await chatService.createDM(otherId);
      setShowNewChat(null);
      handleCategoryChange("secondary");
      await loadConversations();
      void handleSelect(conv.id);
    } catch (e: any) { alert(e?.data?.code || e?.message || "DM failed"); }
  };
  const handleCreateGroup = async () => {
    if (!groupName.trim() || groupMembers.length === 0) { alert("Name and members required"); return; }
    try {
      const conv = await chatService.createGroup({ name: groupName.trim(), avatar: groupAvatar, memberIds: groupMembers });
      setShowNewChat(null); setGroupName(""); setGroupMembers([]); setGroupAvatar(null);
      handleCategoryChange("secondary");
      await loadConversations();
      void handleSelect(conv.id);
    } catch (e: any) { alert(e?.data?.code || e?.message || "Group failed"); }
  };

  const handleMessageSearch = async () => {
    if (!selectedId) return;
    await loadMessages(selectedId, undefined, false, messageSearch.trim() || undefined);
  };

  const handleAudit = async (m: Message) => {
    try {
      const data = await chatService.getAudit(m.id);
      setAuditData(data);
    } catch (e: any) { alert(e?.data?.code || "Audit failed"); }
  };

  // Group official sections for main
  const mainGroups = useMemo(() => conversations.filter((c) => c.type === "official_group"), [conversations]);
  const mainPrivates = useMemo(() => conversations.filter((c) => c.type === "official_private"), [conversations]);

  const isAdmin = user?.role === "admin";

  const composerDisabled = !selectedId || user?.status !== "active" || selectedConv?.isArchived;

  const showReminderOptions = useMemo(() => {
    const hasMention = composer.includes("@workers") || composer.includes("@suppliers") || composer.includes("@customers") || composer.includes("@managers") || composer.includes("@everyone");
    return hasMention;
  }, [composer]);

  return (
    <RvbShell activePage="chats">
      <div className={styles.chatRoot} dir={isRtl ? "rtl" : "ltr"}>
        <div className={styles.chatToolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchPlaceholder} />
          </div>
          <button className={styles.primaryButton} onClick={() => setShowNewChat("choice")}><UserPlus size={14} />{t.newChat}</button>
          {!socketConnected && <span style={{ fontSize: 11, color: "var(--danger)", display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}><AlertTriangle size={12} />{t.socketDisconnected}</span>}
        </div>

        <div className={`${styles.chatLayout} ${showInfo && selectedConv ? styles.chatLayoutWithInfo : ""}`}>
          {/* Left */}
          <div className={`${styles.leftPanel} ${mobileShowChat ? styles.leftPanelHiddenMobile : ""}`}>
            <div className={styles.leftTabsBar} role="tablist">
              <button role="tab" aria-selected={category === "main"} className={`${styles.leftTab} ${category === "main" ? styles.leftTabActive : ""}`} onClick={() => handleCategoryChange("main")}>{t.main}</button>
              <button role="tab" aria-selected={category === "secondary"} className={`${styles.leftTab} ${category === "secondary" ? styles.leftTabActive : ""}`} onClick={() => handleCategoryChange("secondary")}>{t.secondary}</button>
            </div>

            <div className={styles.conversationList}>
              {loadingConvs ? (
                <div className={styles.emptyState}>{t.searchChats}…</div>
              ) : convError ? (
                <div className={styles.errorBox}>{convError} <button className={styles.secondaryButton} onClick={() => void loadConversations()}>{t.retry}</button></div>
              ) : filteredConversations.length === 0 ? (
                <div className={styles.emptyState}>
                  <MessagesSquare size={20} style={{ margin: "0 auto 8px", display: "block", color: "var(--subtle)" }} />
                  <div>{category === "main" ? t.noMain : t.noSecondary}</div>
                  {category === "secondary" && (
                    <button className={styles.primaryButton} onClick={() => setShowNewChat("choice")} style={{ marginTop: 10 }}>{t.startNew}</button>
                  )}
                </div>
              ) : category === "main" ? (
                <>
                  <div className={styles.sectionLabel}>{t.officialGroups}</div>
                  {mainGroups.length === 0 ? <div className={styles.emptyState} style={{ padding: 12 }}>{t.noMain}</div> : mainGroups.map((c) => (
                    <div key={c.id} className={`${styles.convItem} ${selectedId === c.id ? styles.convItemActive : ""}`} onClick={() => void handleSelect(c.id)}>
                      <span className={styles.convAvatar}>{c.name ? initials(c.name) : "G"}</span>
                      <span className={styles.convMeta}>
                        <span className={styles.convNameRow}><span className={styles.convName}>{getConversationDisplayName(c, myId, t)}</span><span className={styles.officialBadge}>{t.officialBadge}</span></span>
                        <span className={styles.convPreview}>{c.lastMessagePreview || "—"}</span>
                      </span>
                      <span className={styles.convRight}>
                        <span className={styles.time}>{c.lastMessageAt ? formatTime(c.lastMessageAt, lang) : ""}</span>
                        {c.unreadCount ? <span className={styles.unread}>{c.unreadCount}</span> : null}
                        {c.pinnedMessages?.length ? <Pin size={10} className={styles.pinIcon} /> : null}
                      </span>
                    </div>
                  ))}
                  <div className={styles.sectionLabel}>{t.officialPrivate}</div>
                  {mainPrivates.length === 0 ? <div className={styles.emptyState} style={{ padding: 12 }}>{t.noMain}</div> : mainPrivates.map((c) => {
                    const other = (c.participants as any[]).find((p: any) => p.accountId !== myId);
                    const display = other?.account?.displayName || "Official";
                    const tag = other?.account?.tag ? `@${other.account.tag}` : "";
                    return (
                      <div key={c.id} className={`${styles.convItem} ${selectedId === c.id ? styles.convItemActive : ""}`} onClick={() => void handleSelect(c.id)}>
                        <span className={styles.convAvatar}>{other?.account?.profilePicture ? <img src={other.account.profilePicture} alt="" /> : initials(display)}</span>
                        <span className={styles.convMeta}>
                          <span className={styles.convNameRow}><span className={styles.convName}>{display}</span><span className={styles.officialBadge}>{t.officialBadge}</span></span>
                          <span className={styles.convPreview} dir="ltr">{tag}</span>
                        </span>
                        <span className={styles.convRight}>
                          <span className={styles.time}>{c.lastMessageAt ? formatTime(c.lastMessageAt, lang) : ""}</span>
                          {c.unreadCount ? <span className={styles.unread}>{c.unreadCount}</span> : null}
                        </span>
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <div className={styles.sectionLabel}>{t.dms}</div>
                  {filteredConversations.filter((c) => c.type === "dm").map((c) => {
                    const other = (c.participants as any[]).find((p: any) => p.accountId !== myId);
                    const display = other?.account?.displayName || getConversationDisplayName(c, myId, t);
                    return (
                      <div key={c.id} className={`${styles.convItem} ${selectedId === c.id ? styles.convItemActive : ""}`} onClick={() => void handleSelect(c.id)}>
                        <span className={styles.convAvatar}>{other?.account?.profilePicture ? <img src={other.account.profilePicture} alt="" /> : initials(display)}</span>
                        <span className={styles.convMeta}>
                          <span className={styles.convName}>{display}</span>
                          <span className={styles.convPreview}>{c.lastMessagePreview || "—"}</span>
                        </span>
                        <span className={styles.convRight}>
                          <span className={styles.time}>{c.lastMessageAt ? formatTime(c.lastMessageAt, lang) : ""}</span>
                          {c.unreadCount ? <span className={styles.unread}>{c.unreadCount}</span> : null}
                        </span>
                      </div>
                    );
                  })}
                  <div className={styles.sectionLabel}>{t.groups}</div>
                  {filteredConversations.filter((c) => c.type === "group").map((c) => (
                    <div key={c.id} className={`${styles.convItem} ${selectedId === c.id ? styles.convItemActive : ""}`} onClick={() => void handleSelect(c.id)}>
                      <span className={styles.convAvatar}><Users size={16} /></span>
                      <span className={styles.convMeta}>
                        <span className={styles.convName}>{c.name || "Group"}</span>
                        <span className={styles.convPreview}>{c.lastMessagePreview || `${(c.participants as any[]).length} ${t.members}`}</span>
                      </span>
                      <span className={styles.convRight}>
                        <span className={styles.time}>{c.lastMessageAt ? formatTime(c.lastMessageAt, lang) : ""}</span>
                        {c.unreadCount ? <span className={styles.unread}>{c.unreadCount}</span> : null}
                        {c.pinnedMessages?.length ? <Pin size={10} className={styles.pinIcon} /> : null}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Center */}
          <div className={`${styles.centerPanel} ${!mobileShowChat ? styles.centerHiddenMobile : ""}`} style={{ position: "relative" }}>
            {!selectedId || !selectedConv ? (
              <div className={styles.emptyCenter}>
                <div className={styles.emptyCenterCard}><MessagesSquare size={32} style={{ display: "block", margin: "0 auto 10px", color: "var(--subtle)" }} /><div className={styles.emptyCenterTitle}>{t.noConversations}</div><small style={{ color: "var(--subtle)" }}>{t.mentionHint}</small></div>
              </div>
            ) : (
              <>
                <div className={styles.centerHeader}>
                  <button className={`${styles.iconButton} ${styles.backButton}`} onClick={() => setMobileShowChat(false)} aria-label={t.back}><CornerUpLeft size={16} /></button>
                  <div className={styles.convAvatar} style={{ width: 36, height: 36, flex: "0 0 36px" }}>
                    {selectedConv.type === "group" ? <Users size={16} /> : selectedConv.type === "official_group" ? initials(getConversationDisplayName(selectedConv, myId, t)) : (() => {
                      const other = (selectedConv.participants as any[]).find((p: any) => p.accountId !== myId);
                      return other?.account?.profilePicture ? <img src={other.account.profilePicture} alt="" /> : initials(other?.account?.displayName || getConversationDisplayName(selectedConv, myId, t));
                    })()}
                  </div>
                  <div className={styles.centerHeaderInfo}>
                    <div className={styles.centerTitle}>{getConversationDisplayName(selectedConv, myId, t)} {selectedConv.isSystemManaged && <span className={styles.officialBadge} style={{ marginInlineStart: 6 }}>{t.officialBadge}</span>}</div>
                    <div className={styles.centerSubtitle}>
                      {selectedConv.type === "dm" || selectedConv.type === "official_private"
                        ? (selectedConv.participants as any[]).find((p: any) => p.accountId !== myId)?.account?.tag ? `@${(selectedConv.participants as any[]).find((p: any) => p.accountId !== myId)?.account?.tag}` : ""
                        : `${(selectedConv.participants as any[]).filter((p: any) => !p.leftAt).length} ${t.members}`}
                      {Object.keys(typingUsers).length ? ` · ${Object.values(typingUsers).join(", ")} ${t.typing}` : ""}
                    </div>
                  </div>
                  <button className={styles.iconButton} onClick={() => setShowInfo((v) => !v)} aria-label={t.details}><MoreVertical size={14} /></button>
                  <button className={styles.iconButton} onClick={() => setMobileShowChat(false)} aria-label={t.back} style={{}}><X size={14} /></button>
                </div>

                {selectedConv.pinnedMessages && selectedConv.pinnedMessages.length > 0 && (
                  <div className={styles.pinnedBar}>
                    <Pin size={14} /> {selectedConv.pinnedMessages.length} {t.pinned} · {t.pinnedMessages}
                    <button className={styles.secondaryButton} style={{ marginInlineStart: "auto", minHeight: 28, padding: "0 8px", fontSize: 11 }} onClick={() => setPinnedExpanded((v) => !v)}>{pinnedExpanded ? "Hide" : "View"}</button>
                  </div>
                )}

                <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, background: "var(--panel)" }}>
                  <div style={{ flex: 1, display: "flex", gap: 6 }}>
                    <input value={messageSearch} onChange={(e) => setMessageSearch(e.target.value)} placeholder={t.searchMessages} style={{ flex: 1, height: 34, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-hover)", fontSize: 12 }} />
                    <button className={styles.secondaryButton} onClick={() => void handleMessageSearch()} style={{ minHeight: 34, padding: "0 10px" }}><Search size={14} /></button>
                  </div>
                </div>

                <div ref={messagesRef} className={styles.messagesScroll} onScroll={handleScroll}>
                  {hasMore && messages.length > 0 && (
                    <button className={styles.secondaryButton} onClick={() => { const oldest = messages[0]?.createdAt; if (oldest && selectedId) void loadMessages(selectedId, oldest, true); }} style={{ alignSelf: "center", minHeight: 30, fontSize: 11 }} disabled={messagesLoading}>{t.loadOlder}</button>
                  )}
                  {messagesLoading && messages.length === 0 ? <div className={styles.emptyState}>{t.searchChats}…</div> : messagesError ? <div className={styles.errorBox}>{messagesError} <button className={styles.secondaryButton} onClick={() => selectedId && void loadMessages(selectedId)}>{t.retry}</button></div> : messages.length === 0 ? <div className={styles.emptyState}>{t.noMessages}</div> : messages.map((m) => {
                    const isMe = m.senderAccountId === myId;
                    const senderAcc = (selectedConv.participants as any[]).find((p: any) => p.accountId === m.senderAccountId)?.account;
                    const canEdit = isMe && !m.isDeleted && Date.now() - m.createdAt < 15 * 60 * 1000;
                    const isPinned = selectedConv.pinnedMessages?.some((p) => p.messageId === m.id);
                    const readCount = (m.readBy || []).filter((r) => r.accountId !== myId).length;
                    const replyOrig = m.replyToMessageId ? messages.find((x) => x.id === m.replyToMessageId) : null;
                    return (
                      <div key={m.id} id={`msg-${m.id}`} className={`${styles.messageRow} ${isMe ? styles.messageRowMe : ""}`}>
                        {!isMe && <span className={styles.messageAvatar}>{senderAcc?.profilePicture ? <img src={senderAcc.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(senderAcc?.displayName || "U")}</span>}
                        <div className={`${styles.messageBubble} ${isMe ? styles.messageBubbleMe : ""}`}>
                          {m.replyToMessageId && (
                            <div className={styles.replyPreview} onClick={() => {
                              const el = document.getElementById(`msg-${m.replyToMessageId}`);
                              el?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }}>
                              <strong>{replyOrig ? (replyOrig.senderAccountId === myId ? "You" : (selectedConv.participants as any[]).find((p: any) => p.accountId === replyOrig.senderAccountId)?.account?.displayName || "…") : "…"}: </strong>
                              {replyOrig ? (replyOrig.isDeleted ? t.deleted : messagePreview(replyOrig.content, replyOrig.attachments) || t.deleted) : t.deleted}
                            </div>
                          )}
                          {Array.isArray(m.attachments) && m.attachments.length > 0 && !m.isDeleted && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: m.content ? 6 : 2 }}>
                              {(m.attachments as ChatAttachment[]).map((a) => {
                                // URL metadata only; anything without an http(s)
                                // url is skipped (never render binary inline).
                                const url = typeof a?.url === "string" && /^https?:\/\//i.test(a.url) ? a.url : null;
                                if (!url) return null;
                                if (a.kind === "image") {
                                  const ratio = a.width && a.height && a.width > 0 && a.height > 0 ? a.width / a.height : 4 / 3;
                                  return (
                                    <img
                                      key={a.id || url}
                                      src={url}
                                      alt={t.imageLabel}
                                      className={styles.attachmentImage}
                                      style={{ aspectRatio: String(Math.min(Math.max(ratio, 0.5), 2)) }}
                                      onClick={() => setPreviewAttachment(a)}
                                    />
                                  );
                                }
                                if (a.kind === "video") {
                                  if (videoFailed[a.id || url]) {
                                    return (
                                      <a key={a.id || url} href={url} target="_blank" rel="noreferrer" className={styles.secondaryButton} style={{ minHeight: 26, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>{t.openVideo}</a>
                                    );
                                  }
                                  return (
                                    // Native HTML5 playback, no autoplay. If the
                                    // codec is unsupported, fall back to a link.
                                    <video
                                      key={a.id || url}
                                      src={url}
                                      controls
                                      preload="metadata"
                                      className={styles.attachmentVideo}
                                      onError={() => setVideoFailed((prev) => ({ ...prev, [a.id || url]: true }))}
                                    />
                                  );
                                }
                                return null;
                              })}
                            </div>
                          )}
                          <div dir="auto" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {m.isDeleted ? <em style={{ opacity: 0.8 }}>{t.deleted}</em> : m.content ? m.content : (m.attachments?.length ? messagePreview("", m.attachments) : "")}
                          </div>
                          <div className={`${styles.messageMeta} ${isMe ? styles.messageMetaMe : ""}`}>
                            <span>{formatTime(m.createdAt, lang)}</span>
                            {m.editedAt && <span>· {t.edited}</span>}
                            {isPinned && <span>· <Pin size={10} /> {t.pinned}</span>}
                            {!m.isDeleted && readCount > 0 && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><CheckCheck size={12} /> {selectedConv.participants.length > 12 ? `${readCount > 3 ? "3+" : readCount}` : `${readCount} ${t.readBy}`}</span>
                            )}
                          </div>
                          {/* reactions */}
                          {(m.reactions && m.reactions.length > 0) && (
                            <div className={styles.reactionBar}>
                              {(() => {
                                const grouped: Record<string, number> = {};
                                for (const r of m.reactions as any[]) grouped[r.emoji] = (grouped[r.emoji] || 0) + 1;
                                return Object.entries(grouped).map(([emoji, count]) => (
                                  <span key={emoji} className={`${styles.reactionPill} ${m.reactions?.some((x: any) => x.accountId === myId && x.emoji === emoji) ? styles.reactionPillActive : ""}`} onClick={() => void handleReaction(m)}>{emoji} {count}</span>
                                ));
                              })()}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                            {!m.isDeleted && <button className={styles.secondaryButton} style={{ minHeight: 24, padding: "0 6px", fontSize: 11 }} onClick={() => setReplyTo(m)}><CornerUpLeft size={10} />{t.reply}</button>}
                            <button className={styles.secondaryButton} style={{ minHeight: 24, padding: "0 6px", fontSize: 11 }} onClick={() => void handleReaction(m)}><Handshake size={10} />{t.react}</button>
                            {!m.isDeleted && <button className={styles.secondaryButton} style={{ minHeight: 24, padding: "0 6px", fontSize: 11 }} onClick={() => void handlePin(m)}>{isPinned ? t.unpin : t.pin}</button>}
                            {canEdit && <button className={styles.secondaryButton} style={{ minHeight: 24, padding: "0 6px", fontSize: 11 }} onClick={() => handleEditClick(m)}><Edit3 size={10} />{t.edit}</button>}
                            {isMe && !m.isDeleted && <button className={styles.secondaryButton} style={{ minHeight: 24, padding: "0 6px", fontSize: 11 }} onClick={() => void handleDelete(m)}><Trash2 size={10} />{t.delete}</button>}
                            {isAdmin && <button className={styles.secondaryButton} style={{ minHeight: 24, padding: "0 6px", fontSize: 11 }} onClick={() => void handleAudit(m)}><Eye size={10} />{t.audit}</button>}
                          </div>
                        </div>
                        {isMe && <span className={styles.messageAvatar} style={{ background: "var(--accent)", color: "#fff" }}>{initials(user?.displayName || "Me")}</span>}
                      </div>
                    );
                  })}
                  {Object.keys(typingUsers).length > 0 && <div style={{ fontSize: 11, color: "var(--muted)", padding: "4px 0" }}>{Object.values(typingUsers).join(", ")} {t.typing}</div>}
                </div>

                {(replyTo || editing) && (
                  <div className={styles.replyStrip}>
                    <CornerUpLeft size={12} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {editing ? `${t.edit}: ${messagePreview(editing.content, editing.attachments).slice(0, 40)}` : `${t.reply}: ${replyTo ? messagePreview(replyTo.content, replyTo.attachments).slice(0, 40) : ""}`}
                    </span>
                    <button className={styles.iconButton} onClick={() => { setReplyTo(null); setEditing(null); setComposer(editing ? "" : composer); }}><X size={12} /></button>
                  </div>
                )}

                {showReminderOptions && (
                  <div style={{ padding: "0 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <small style={{ fontSize: 11, color: "var(--muted)" }}>{t.reminder}:</small>
                    <button className={`${styles.secondaryButton} ${reminderChoice === 30 ? styles.primaryButton : ""}`} style={{ minHeight: 26, padding: "0 8px", fontSize: 11 }} onClick={() => setReminderChoice(reminderChoice === 30 ? null : 30)}><Clock size={10} />{t.reminder30}</button>
                    <button className={`${styles.secondaryButton} ${reminderChoice === 60 ? styles.primaryButton : ""}`} style={{ minHeight: 26, padding: "0 8px", fontSize: 11 }} onClick={() => setReminderChoice(reminderChoice === 60 ? null : 60)}><Clock size={10} />{t.reminder60}</button>
                    <button className={`${styles.secondaryButton} ${reminderChoice === 120 ? styles.primaryButton : ""}`} style={{ minHeight: 26, padding: "0 8px", fontSize: 11 }} onClick={() => setReminderChoice(reminderChoice === 120 ? null : 120)}><Clock size={10} />{t.reminder120}</button>
                  </div>
                )}

                {(stagedFile || attachError) && (
                  <div className={styles.stagedBar}>
                    {stagedUrl && stagedFile?.type.startsWith("image/") ? (
                      <img src={stagedUrl} alt="" className={styles.stagedThumb} />
                    ) : stagedFile ? (
                      <span className={styles.stagedThumb} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>{t.videoLabel}</span>
                    ) : null}
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {stagedFile ? `${stagedFile.name} · ${Math.max(1, Math.round(stagedFile.size / 1024))} KB` : ""}
                      {uploadedAttachment ? ` · ${t.ready}` : uploading ? ` · ${t.uploading}` : ""}
                    </span>
                    {attachError ? <span style={{ color: "var(--danger)", fontSize: 11 }}>{attachError}</span> : null}
                    <button className={styles.iconButton} onClick={clearStaged} aria-label={t.attachRemove}><X size={12} /></button>
                  </div>
                )}

                <div className={styles.composer}>
                  <div className={styles.composerRow}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        handleFileSelect(e.target.files?.[0] || null);
                      }}
                    />
                    <button
                      className={styles.iconButton}
                      style={{ width: 44, height: 44, flex: "none" }}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={composerDisabled || sending || uploading}
                      aria-label={t.attach}
                      title={t.attach}
                    >
                      <Paperclip size={16} />
                    </button>
                    <textarea
                      ref={composerRef}
                      className={styles.composerInput}
                      value={composer}
                      onChange={(e) => setComposer(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={composerDisabled ? t.archivedCannotSend : t.message}
                      rows={1}
                      disabled={composerDisabled || sending}
                      aria-label={t.message}
                    />
                    <button className={styles.sendButton} onClick={() => void handleSend()} disabled={composerDisabled || sending || uploading || (!composer.trim() && !stagedFile && !uploadedAttachment)} aria-label={t.send}><Send size={16} /></button>
                  </div>
                  <small style={{ fontSize: 11, color: "var(--subtle)" }}>{t.enterToSend} · {t.mentionHint}</small>
                </div>
              </>
            )}
          </div>

          {/* Right info panel */}
          {showInfo && selectedConv && (
            <div className={styles.rightPanel}>
              <div className={styles.rightHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{t.info}</span><button className={styles.iconButton} onClick={() => setShowInfo(false)}><X size={12} /></button>
              </div>
              <div className={styles.rightBody}>
                <div className={styles.memberRow} style={{ flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <span className={styles.convAvatar} style={{ width: 56, height: 56, flex: "0 0 56px", fontSize: 18 }}>{selectedConv.type === "group" ? <Users size={20} /> : initials(getConversationDisplayName(selectedConv, myId, t))}</span>
                  <strong style={{ fontSize: 14 }}>{getConversationDisplayName(selectedConv, myId, t)}</strong>
                  <small style={{ color: "var(--muted)" }}>{selectedConv.isSystemManaged ? t.officialBadge : selectedConv.type}</small>
                  {selectedConv.type === "group" && !selectedConv.isSystemManaged && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button className={styles.secondaryButton} onClick={() => {
                        const n = prompt(t.groupName, selectedConv.name || "");
                        if (n && n.trim()) chatService.updateGroup(selectedConv.id, { name: n.trim() }).then((c) => setSelectedConv(c)).catch((e) => alert(e.message));
                      }}>{t.renameGroup}</button>
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>{t.members} ({(selectedConv.participants as any[]).filter((p: any) => !p.leftAt).length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(selectedConv.participants as any[]).filter((p: any) => !p.leftAt).map((p: any) => (
                      <div key={p.accountId} className={styles.memberRow}>
                        <span className={styles.memberAvatar}>{p.account?.profilePicture ? <img src={p.account.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(p.account?.displayName || "?")}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.account?.displayName || p.accountId.slice(0, 8)}</strong>
                          <small dir="ltr" style={{ fontSize: 11, color: "var(--muted)" }}>@{p.account?.tag || "—"} · {p.role}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                  {selectedConv.type === "group" && !selectedConv.isSystemManaged && (
                    <button className={styles.secondaryButton} style={{ marginTop: 10, width: "100%" }} onClick={async () => {
                      setShowNewChat("dm"); // reuse dir for adding
                      // For now prompt add
                      const tag = prompt("Add member @tag");
                      if (!tag) return;
                      const found = dirAccounts.find((a) => a.tag.toLowerCase() === tag.toLowerCase().replace(/^@/, ""));
                      if (!found) { alert("Not found"); return; }
                      try {
                        const c = await chatService.updateGroup(selectedConv.id, { addMemberIds: [found.id] });
                        setSelectedConv(c); void loadConversations();
                      } catch (e: any) { alert(e.message); }
                    }}><UserPlus size={12} />{t.addMembers}</button>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>{t.pinnedMessages} ({selectedConv.pinnedMessages?.length || 0}/3)</div>
                  {selectedConv.pinnedMessages && selectedConv.pinnedMessages.length > 0 ? selectedConv.pinnedMessages.map((p) => {
                    const pm = messages.find((m) => m.id === p.messageId);
                    return (
                      <div key={p.messageId} style={{ padding: 8, border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-hover)", fontSize: 12, marginBottom: 6 }}>
                        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pm ? (pm.isDeleted ? t.deleted : messagePreview(pm.content, pm.attachments) || p.messageId.slice(0, 8)) : p.messageId.slice(0, 8)}</div>
                        <small style={{ color: "var(--muted)" }}>{formatDateShort(p.pinnedAt, lang)}</small>
                      </div>
                    );
                  }) : <small style={{ color: "var(--subtle)" }}>{t.noConversations}</small>}
                </div>

                {!selectedConv.isSystemManaged && selectedConv.category === "secondary" && (
                  <button className={styles.secondaryButton} style={{ borderColor: "var(--danger)", color: "var(--danger)", justifyContent: "center" }} onClick={handleLeave}><LogOut size={12} />{t.leaveGroup}</button>
                )}
                {selectedConv.isSystemManaged && <small style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>{t.historyRemains}</small>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Chat choice */}
      {showNewChat === "choice" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", zIndex: 1000 }} onClick={() => setShowNewChat(null)}>
          <div style={{ width: "min(360px, 92vw)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }} onClick={(e) => e.stopPropagation()} dir={isRtl ? "rtl" : "ltr"}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{t.newChat}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              <button className={styles.primaryButton} onClick={() => setShowNewChat("dm")} style={{ justifyContent: "center" }}><MessagesSquare size={14} />{t.newMessage}</button>
              <button className={styles.secondaryButton} onClick={() => setShowNewChat("group")} style={{ justifyContent: "center" }}><Users size={14} />{t.newGroup}</button>
              <button className={styles.secondaryButton} onClick={() => setShowNewChat(null)} style={{ justifyContent: "center" }}>{t.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {showNewChat === "dm" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", zIndex: 1000 }} onClick={() => setShowNewChat(null)}>
          <div style={{ width: "min(420px, 92vw)", maxHeight: "80vh", display: "flex", flexDirection: "column", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }} onClick={(e) => e.stopPropagation()} dir={isRtl ? "rtl" : "ltr"}>
            <div style={{ padding: 14, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{t.newMessage}</strong><button className={styles.iconButton} onClick={() => setShowNewChat(null)}><X size={12} /></button>
            </div>
            <div style={{ padding: 12, borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className={styles.searchBox}><Search size={14} /><input value={dirSearch} onChange={(e) => setDirSearch(e.target.value)} placeholder={t.dirSearch} /></div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                {["all", "worker", "supplier", "customer", "manager", "admin", "supervisor"].map((r) => (
                  <button key={r} className={dirRole === r ? styles.primaryButton : styles.secondaryButton} onClick={() => setDirRole(r)} style={{ minHeight: 28, padding: "0 8px", fontSize: 11 }}>{r === "all" ? t.all : r}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
              {filteredDir.length === 0 ? <div className={styles.emptyState}>{t.noDirectory}</div> : filteredDir.map((a) => (
                <div key={a.id} className={styles.convItem} onClick={() => void openDM(a.id)}>
                  <span className={styles.convAvatar}>{a.profilePicture ? <img src={a.profilePicture} alt="" /> : initials(a.displayName)}</span>
                  <span className={styles.convMeta}><span className={styles.convName}>{a.displayName}</span><span className={styles.convPreview} dir="ltr">@{a.tag} · {a.role}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showNewChat === "group" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", zIndex: 1000 }} onClick={() => setShowNewChat(null)}>
          <div style={{ width: "min(440px, 92vw)", maxHeight: "84vh", display: "flex", flexDirection: "column", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }} onClick={(e) => e.stopPropagation()} dir={isRtl ? "rtl" : "ltr"}>
            <div style={{ padding: 14, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>{t.newGroup}</strong><button className={styles.iconButton} onClick={() => setShowNewChat(null)}><X size={12} /></button></div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700 }}>{t.groupName}<input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={t.groupName} style={{ height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8 }} /></label>
              <div className={styles.searchBox}><Search size={14} /><input value={dirSearch} onChange={(e) => setDirSearch(e.target.value)} placeholder={t.dirSearch} /></div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                {["all", "worker", "supplier", "customer", "manager", "admin", "supervisor"].map((r) => (
                  <button key={r} className={dirRole === r ? styles.primaryButton : styles.secondaryButton} onClick={() => setDirRole(r)} style={{ minHeight: 28, padding: "0 8px", fontSize: 11 }}>{r === "all" ? t.all : r}</button>
                ))}
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                {filteredDir.map((a) => {
                  const selected = groupMembers.includes(a.id);
                  return (
                    <label key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: selected ? "var(--accent-soft)" : undefined }}>
                      <input type="checkbox" checked={selected} onChange={(e) => setGroupMembers((prev) => e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id))} />
                      <span className={styles.convAvatar} style={{ width: 28, height: 28, flex: "0 0 28px" }}>{a.profilePicture ? <img src={a.profilePicture} alt="" /> : initials(a.displayName)}</span>
                      <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", fontSize: 12 }}>{a.displayName}</strong><small dir="ltr" style={{ fontSize: 11, color: "var(--muted)" }}>@{a.tag} · {a.role}</small></span>
                    </label>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={styles.secondaryButton} onClick={() => setShowNewChat(null)} style={{ flex: 1 }}>{t.cancel}</button>
                <button className={styles.primaryButton} onClick={() => void handleCreateGroup()} style={{ flex: 1 }}>{t.create}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewAttachment && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "grid", placeItems: "center", zIndex: 1000 }} onClick={() => setPreviewAttachment(null)}>
          <div style={{ width: "min(720px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }} onClick={(e) => e.stopPropagation()} dir={isRtl ? "rtl" : "ltr"}>
            <div style={{ padding: 12, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>{t.imageLabel}</strong>
              <button className={styles.iconButton} onClick={() => setPreviewAttachment(null)}><X size={12} /></button>
            </div>
            <div style={{ padding: 12, overflow: "auto", display: "grid", placeItems: "center", background: "#000" }}>
              <img src={previewAttachment.url} alt={t.imageLabel} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }} />
            </div>
          </div>
        </div>
      )}

      {auditData && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", zIndex: 1000 }} onClick={() => setAuditData(null)}>
          <div style={{ width: "min(560px, 92vw)", maxHeight: "80vh", overflowY: "auto", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }} onClick={(e) => e.stopPropagation()} dir={isRtl ? "rtl" : "ltr"}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><strong>{t.audit}</strong><button className={styles.iconButton} onClick={() => setAuditData(null)}><X size={12} /></button></div>
            <div style={{ fontSize: 12, fontFamily: "ui-monospace", whiteSpace: "pre-wrap", background: "var(--panel-hover)", padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}>
              Current: {auditData.message?.content || "—"}{auditData.message?.isDeleted ? ` (deleted at ${auditData.message?.deletedAt})` : ""}
            </div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {(auditData.audits || []).map((a: any, i: number) => (
                <div key={i} style={{ padding: 8, border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}>
                  <strong>{a.action}</strong> by {a.actorAccountId.slice(0, 8)} at {formatDateShort(a.createdAt, lang)}
                  <div style={{ color: "var(--muted)", marginTop: 4 }}>{a.previousContent ? `prev: ${a.previousContent.slice(0, 80)}` : ""} {a.newContent ? `→ ${a.newContent.slice(0, 80)}` : ""} {a.contentSnapshot ? a.contentSnapshot.slice(0, 80) : ""}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </RvbShell>
  );
}

export default function RvbChatsPage() {
  return (
    <RvbAuthGuard>
      <ChatsInner />
    </RvbAuthGuard>
  );
}

