import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable, Alert } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { SearchField } from "@/components/common/SearchField";
import { Button } from "@/components/common/Button";
import { Avatar } from "@/components/common/Avatar";
import { AppModal } from "@/components/common/Modal";
import { AppHeader } from "@/components/layout/AppHeader";
import { useTheme } from "@/theme/useTheme";
import { getConversations, createGroup, createDM } from "@/services/chat.service";
import { searchDirectory } from "@/services/directory.service";
import { router } from "expo-router";
import { isRTL } from "@/i18n";

export default function SecondaryChatsScreen({ bare = false }: { bare?: boolean }) {
  const { theme } = useTheme();
  const rtl = isRTL();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [directory, setDirectory] = useState<any[]>([]);
  const [dirPage, setDirPage] = useState(1);
  const [dirHasMore, setDirHasMore] = useState(true);
  const [dirLoading, setDirLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getConversations("secondary");
      setConversations(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load secondary chats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = async () => {
    setShowNew(true);
    setDirPage(1);
    setDirHasMore(true);
    try {
      const res = await searchDirectory({ page: 1, limit: 50 });
      const list = Array.isArray(res) ? res : (res as any)?.data || [];
      setDirectory(list);
      setDirHasMore(list.length >= 50);
    } catch {}
  };
  const loadMoreDirectory = async () => {
    if (dirLoading || !dirHasMore) return;
    setDirLoading(true);
    try {
      const next = dirPage + 1;
      const res = await searchDirectory({ page: next, limit: 50 });
      const list = Array.isArray(res) ? res : (res as any)?.data || [];
      setDirectory((prev) => [...prev, ...list]);
      setDirPage(next);
      if (list.length < 50) setDirHasMore(false);
    } catch {}
    finally { setDirLoading(false); }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert("Invalid", "Group name required");
      return;
    }
    if (selected.size === 0) {
      Alert.alert("Invalid", "Select at least one member");
      return;
    }
    try {
      const conv = await createGroup({ name: groupName.trim(), memberIds: Array.from(selected) });
      setShowNew(false);
      setGroupName("");
      setSelected(new Set());
      router.push(`/(app)/chat/${conv.id}` as any);
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not create group");
    }
  };

  if (loading) return <Loading message="Loading secondary chats..." />;
  if (error && conversations.length === 0) return <ErrorState title="Could not load chats" message={error} onRetry={load} />;

  const filtered = search.trim() ? conversations.filter((c) => c.name?.toLowerCase().includes(search.toLowerCase())) : conversations;

  // Bare mode: embedded inside the Chats hub (hub owns Screen + header).
  // Standalone route keeps its own chrome. All logic/routes/modals/sockets
  // are identical in both modes.
  const body = (
    <>
      <View style={{ padding: 16, backgroundColor: theme.colors.background }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Chats</Text>
          <Button title="+ New" onPress={openNew} />
        </View>
        <View style={{ marginTop: 12 }}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search groups or DMs" />
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Empty title="No secondary chats" message="Create a DM or group. Any role can chat if permitted." />}
        renderItem={({ item }) => {
          const name = item.name || item.participants?.map((p: any) => p.account?.displayName || p.accountId).join(", ").slice(0, 40) || "Chat";
          const last = item.lastMessagePreview || item.lastMessage?.content || item.lastMessageContent || "";
          const isGroup = item.type === "group" || (item.participants?.length || 0) > 2;
          return (
            <Pressable onPress={() => router.push(`/(app)/chat/${item.id}` as any)} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
              <View style={[styles.row, rtl && { flexDirection: "row-reverse" }]}>
                <Avatar uri={null} name={name} size={44} />
                <View style={[styles.info, rtl && { alignItems: "flex-end", marginLeft: 0, marginRight: 10 }]}>
                  <Text style={[styles.name, { color: theme.colors.text }, rtl && { textAlign: "right" }]} numberOfLines={1}>
                    {name} {isGroup ? "• Group" : "• DM"}
                  </Text>
                  <Text style={[styles.last, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]} numberOfLines={1}>
                    {last || "No messages yet"}
                  </Text>
                </View>
                {item.unreadCount ? (
                  <View style={[styles.unread, { backgroundColor: theme.colors.primary }]}>
                    <Text style={styles.unreadText}>{item.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
      <AppModal visible={showNew} onClose={() => setShowNew(false)} title="New Group">
        <View style={{ gap: 12 }}>
          <TextInput value={groupName} onChangeText={setGroupName} placeholder="Group name" style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} />
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>Select members (tap to toggle)</Text>
          <View style={{ maxHeight: 240 }}>
            {directory.slice(0, dirPage * 50).map((u) => {
              const id = u.id || u.accountId;
              const sel = selected.has(id);
              return (
                <Pressable key={id} onPress={() => toggleSelect(id)} style={[styles.memberRow, { borderColor: sel ? theme.colors.primary : theme.colors.border, backgroundColor: sel ? theme.colors.primarySoft : theme.colors.surface }]}>
                  <Text style={[styles.memberName, { color: theme.colors.text }]}>{u.displayName || u.name} @{u.tag}</Text>
                  <Text style={{ color: sel ? theme.colors.primary : theme.colors.textSecondary }}>{sel ? "✓" : "+"}</Text>
                </Pressable>
              );
            })}
            {dirHasMore ? (
              <Pressable testID="directory-load-more" accessibilityRole="button" onPress={loadMoreDirectory} style={[styles.memberRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, justifyContent: "center" }]}>
                <Text style={{ color: theme.colors.primary, fontWeight: "600", fontSize: 12 }}>{dirLoading ? "Loading..." : "Load More"}</Text>
              </Pressable>
            ) : null}
          </View>
          <Button title="Create Group" onPress={handleCreateGroup} />
          <Button title="Cancel" variant="secondary" onPress={() => setShowNew(false)} />
        </View>
      </AppModal>
    </>
  );

  if (bare) return body;
  return (
    <Screen padded={false}>
      <AppHeader title="Secondary Chats" subtitle="DMs & Groups • any role" showNotifications />
      {body}
    </Screen>
  );
}

import { TextInput } from "react-native";

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 4 },
  card: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  info: { flex: 1, marginLeft: 10 },
  name: { fontWeight: "700", fontSize: 14 },
  last: { fontSize: 12, marginTop: 2 },
  unread: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, marginLeft: 8 },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13 },
  memberRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10, borderWidth: 1, borderRadius: 8, marginBottom: 6 },
  memberName: { fontWeight: "600", fontSize: 13 },
});
