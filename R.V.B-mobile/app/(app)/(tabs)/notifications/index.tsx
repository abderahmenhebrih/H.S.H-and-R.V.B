import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable, Alert } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { SearchField } from "@/components/common/SearchField";
import { useTheme } from "@/theme/useTheme";
import { getNotifications, markRead, archiveNotification, getUnreadCount, bulkUpdate } from "@/services/notification.service";
import { getSocket } from "@/services/socket";
import { router } from "expo-router";
import { formatDateTime, getCurrentLanguage } from "@/utils/date";
import { isRTL } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";

function resolveNotificationRoute(n: any, role: string): string | null {
  const cat = n.category || n.type;
  const source = n.source || n.sourceType;
  const convId = n.conversationId || n.entityId;
  if (n.conversationId) return `/(app)/chat/${n.conversationId}`;
  if (cat === "chats" || n.type === "chat") return "/(app)/main-chats";
  if (cat === "requests" || n.route === "/rvb/requests") {
    if (role === "worker") return "/(app)/profile/requests";
    if (role === "supplier") return "/(app)/profile/supplier-requests";
    if (role === "customer") return "/(app)/profile/customer-requests";
    if (role === "supervisor" || role === "manager") return "/(app)/profile/requests-management";
    return "/(app)/profile/requests";
  }
  if (cat === "orders" || n.route === "/rvb/orders") {
    if (role === "customer") return "/(app)/profile/customer-orders";
    if (role === "supervisor" || role === "manager") return "/(app)/profile/orders";
    return "/(app)/profile/customer-orders";
  }
  if (cat === "requests" && source === "worker" && role === "worker") return "/(app)/profile/requests";
  return null;
}

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const rtl = isRTL();
  const lang = getCurrentLanguage();
  const role = useAuthStore((s) => s.account?.role) || "worker";
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getNotifications({ status: filter === "all" ? undefined : filter, search: search.trim() || undefined, limit: 50 });
      const list = res.notifications || res.data || [];
      setNotifications(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load notifications");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search, filter]);

  useEffect(() => {
    load();
    const s = getSocket();
    if (!s) return undefined;
    const onNotif = (p: any) => {
      // Avoid double add if id exists
      setNotifications((prev) => {
        if (prev.some((n) => n.id === p.notification?.id)) return prev;
        return [p.notification || p, ...prev];
      });
    };
    s.on("rvb:notification", onNotif);
    return () => {
      s.off("rvb:notification", onNotif);
    };
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const handleBulk = async (action: "read" | "unread" | "archive" | "restore") => {
    if (selectedIds.size === 0) return;
    try {
      await bulkUpdate(Array.from(selectedIds), action);
      setSelectMode(false);
      setSelectedIds(new Set());
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Bulk failed");
    }
  };

  const handlePress = async (n: any) => {
    if (selectMode) {
      toggleSelect(n.id);
      return;
    }
    // Mark read
    if (!n.readAt) {
      try {
        await markRead(n.id);
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: Date.now() } : x)));
      } catch {}
    }
    const route = resolveNotificationRoute(n, role);
    if (route) router.push(route as any);
  };

  if (loading) return <Loading message="Loading notifications..." />;
  if (error && notifications.length === 0) return <ErrorState title="Could not load notifications" message={error} onRetry={load} />;

  return (
    <Screen padded={false}>
      <View style={{ padding: 16, backgroundColor: theme.colors.background }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Notifications</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Real-time • tap to open</Text>
          </View>
          <Pressable testID="notification-select-toggle" accessibilityRole="button" onPress={() => setSelectMode((s) => !s)} style={[styles.selectBtn, { borderColor: theme.colors.border, backgroundColor: selectMode ? theme.colors.primarySoft : theme.colors.surface }]}>
            <Text style={[styles.selectText, { color: selectMode ? theme.colors.primary : theme.colors.textSecondary }]}>{selectMode ? "Done" : "Select"}</Text>
          </Pressable>
        </View>
        {selectMode && selectedIds.size > 0 ? (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <Pressable testID="notification-bulk-read" accessibilityRole="button" onPress={() => handleBulk("read")} style={[styles.bulkBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.bulkText, { color: theme.colors.text }]}>Mark Read</Text>
            </Pressable>
            <Pressable testID="notification-bulk-unread" accessibilityRole="button" onPress={() => handleBulk("unread")} style={[styles.bulkBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.bulkText, { color: theme.colors.text }]}>Mark Unread</Text>
            </Pressable>
            <Pressable testID="notification-bulk-archive" accessibilityRole="button" onPress={() => handleBulk("archive")} style={[styles.bulkBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.bulkText, { color: theme.colors.text }]}>Archive</Text>
            </Pressable>
            <Pressable testID="notification-bulk-restore" accessibilityRole="button" onPress={() => handleBulk("restore")} style={[styles.bulkBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.bulkText, { color: theme.colors.text }]}>Restore</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {["all", "unread", "archived"].map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, { borderColor: filter === f ? theme.colors.primary : theme.colors.border, backgroundColor: filter === f ? theme.colors.primarySoft : theme.colors.surface }]}>
              <Text style={[styles.chipText, { color: filter === f ? theme.colors.primary : theme.colors.textSecondary }]}>{f}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ marginTop: 12 }}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search notifications" />
        </View>
      </View>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Empty title="No notifications" message="Notifications will appear here in real time." />}
        renderItem={({ item }) => {
          const unread = !item.readAt && !item.read;
          const selected = selectedIds.has(item.id);
          return (
            <Pressable
              onPress={() => handlePress(item)}
              onLongPress={() => {
                setSelectMode(true);
                toggleSelect(item.id);
              }}
              testID={`notification-row-${item.id}`}
              style={[styles.card, { backgroundColor: unread ? theme.colors.surfaceElevated : theme.colors.surface, borderColor: selected ? theme.colors.primary : unread ? theme.colors.primaryRing : theme.colors.border, borderWidth: selected ? 2 : 1 }, theme.shadows.xs, rtl && { flexDirection: "column" }]}
            >
              <View style={[styles.row, rtl && { flexDirection: "row-reverse" }]}>
                {selectMode ? (
                  <View style={[styles.checkbox, { borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primary : theme.colors.surface }]}>
                    {selected ? <Text style={{ color: "#fff", fontSize: 10 }}>✓</Text> : null}
                  </View>
                ) : null}
                <View style={{ flex: 1 }}>
                  <View style={[styles.row, rtl && { flexDirection: "row-reverse" }, { justifyContent: "space-between", alignItems: "center" }]}>
                    <Text style={[styles.cat, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{item.category || item.type || "general"}</Text>
                    <Text style={[styles.time, { color: theme.colors.textTertiary }, rtl && { textAlign: "right" }]}>{formatDateTime(item.createdAt || item.date, lang)}</Text>
                  </View>
                  <Text style={[styles.notifTitle, { color: theme.colors.text }, rtl && { textAlign: "right" }]} numberOfLines={1}>
                    {item.title || "Notification"}
                  </Text>
                  <Text style={[styles.body, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]} numberOfLines={2}>
                    {item.message || item.body || ""}
                  </Text>
                  {item.priority ? <Text style={[styles.priority, { color: theme.colors.warning }, rtl && { textAlign: "right" }]}>{item.priority}</Text> : null}
                  {!unread && !selectMode ? (
                    <Pressable onPress={() => archiveNotification(item.id, true).then(load).catch(() => {})} style={{ marginTop: 6 }}>
                      <Text style={{ color: theme.colors.textTertiary, fontSize: 11, textAlign: rtl ? "right" : "left" }}>Archive</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  card: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 10 },
  cat: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  time: { fontSize: 11 },
  notifTitle: { fontWeight: "700", fontSize: 13, marginTop: 4 },
  body: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  priority: { fontSize: 10, fontWeight: "700", marginTop: 4, textTransform: "uppercase" },
  selectBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  selectText: { fontSize: 11, fontWeight: "700" },
  bulkBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  bulkText: { fontSize: 11, fontWeight: "600" },
  row: { flexDirection: "row" },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
