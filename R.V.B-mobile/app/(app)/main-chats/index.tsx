import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { SearchField } from "@/components/common/SearchField";
import { Avatar } from "@/components/common/Avatar";
import { AppHeader } from "@/components/layout/AppHeader";
import { useTheme } from "@/theme/useTheme";
import { getConversations } from "@/services/chat.service";
import { router } from "expo-router";
import { isRTL } from "@/i18n";
import { formatDateTime, getCurrentLanguage } from "@/utils/date";

export default function MainChatsScreen() {
  const { theme } = useTheme();
  const rtl = isRTL();
  const lang = getCurrentLanguage();
  const [conversations, setConversations] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getConversations("main", search.trim() || undefined);
      setConversations(data);
      setFiltered(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load chats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!search.trim()) setFiltered(conversations);
    else {
      const s = search.toLowerCase();
      setFiltered(conversations.filter((c) => c.name?.toLowerCase().includes(s) || c.participants?.some((p: any) => p.account?.tag?.toLowerCase().includes(s))));
    }
  }, [search, conversations]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) return <Loading message="Loading main chats..." />;
  if (error && conversations.length === 0) return <ErrorState title="Could not load chats" message={error} onRetry={load} />;

  return (
    <Screen padded={false}>
      <AppHeader title="Main Chats" subtitle="Official • pinned up to 3" showNotifications />
      <View style={{ padding: 16, backgroundColor: theme.colors.background }}>
        <View style={{ marginTop: 4 }}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search chats or @tag" />
        </View>
        {error ? (
          <View style={{ marginTop: 8 }}>
            <ErrorState title="Error" message={error} onRetry={load} />
          </View>
        ) : null}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Empty title="No main chats" message="Official conversations will appear here." />}
        renderItem={({ item }) => {
          const name = item.name || item.participants?.map((p: any) => p.account?.displayName || p.accountId).join(", ").slice(0, 40) || "Chat";
          const last = item.lastMessage?.content || item.lastMessageContent || "";
          const unread = item.unreadCount || 0;
          const pinned = item.pinnedMessages?.length || 0;
          return (
            <Pressable onPress={() => router.push(`/(app)/chat/${item.id}` as any)} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
              <View style={[styles.row, rtl && { flexDirection: "row-reverse" }]}>
                <Avatar uri={null} name={name} size={44} />
                <View style={[styles.info, rtl && { alignItems: "flex-end", marginLeft: 0, marginRight: 10 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.name, { color: theme.colors.text }, rtl && { textAlign: "right" }]} numberOfLines={1}>
                      {name}
                    </Text>
                    {pinned > 0 ? (
                      <View style={[styles.pinBadge, { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warning }]}>
                        <Text style={[styles.pinText, { color: theme.colors.warning }]}>📌 {pinned}/3</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.last, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]} numberOfLines={1}>
                    {last || "No messages yet"}
                  </Text>
                  {item.updatedAt ? <Text style={[styles.time, { color: theme.colors.textTertiary }]}>{formatDateTime(item.updatedAt, lang)}</Text> : null}
                </View>
                {unread > 0 ? (
                  <View style={[styles.unread, { backgroundColor: theme.colors.primary }]}>
                    <Text style={styles.unreadText}>{unread > 99 ? "99+" : String(unread)}</Text>
                  </View>
                ) : null}
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
  card: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  info: { flex: 1, marginLeft: 10 },
  name: { fontWeight: "700", fontSize: 14, flex: 1 },
  last: { fontSize: 12, marginTop: 2 },
  time: { fontSize: 11, marginTop: 2 },
  pinBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  pinText: { fontSize: 10, fontWeight: "700" },
  unread: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, marginLeft: 8 },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
