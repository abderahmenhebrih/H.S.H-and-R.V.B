import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable, Alert } from "react-native";
import { Screen } from "@/components/common/Screen";
import { SearchField } from "@/components/common/SearchField";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { Avatar } from "@/components/common/Avatar";
import { AppHeader } from "@/components/layout/AppHeader";
import { useTheme } from "@/theme/useTheme";
import { searchDirectory } from "@/services/directory.service";
import { createDM } from "@/services/chat.service";
import { router } from "expo-router";
import { isRTL } from "@/i18n";

const ROLES: (string | undefined)[] = [undefined, "worker", "supervisor", "supplier", "customer", "manager"];

export default function DirectoryScreen() {
  const { theme } = useTheme();
  const rtl = isRTL();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<string | undefined>(undefined);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const search = useCallback(
    async (reset = true) => {
      const currentPage = reset ? 1 : page;
      if (reset) setPage(1);
      setError(null);
      setLoading(true);
      try {
        const data = await searchDirectory({ search: query.trim() || undefined, role, limit: 20, page: currentPage });
        const arr = Array.isArray(data) ? data : [];
        if (reset) setResults(arr);
        else setResults((prev) => [...prev, ...arr]);
        setHasMore(arr.length >= 20);
        if (!reset) setPage(currentPage + 1);
      } catch (e: any) {
        setError(e?.message || "Search failed");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query, role, page],
  );

  useEffect(() => {
    const t = setTimeout(() => search(true), 400);
    return () => clearTimeout(t);
  }, [search, role]);

  useEffect(() => {
    search(true);
  }, []);

  const handleDM = async (user: any) => {
    try {
      const conv = await createDM(user.id || user.accountId);
      router.push(`/(app)/chat/${conv.id}` as any);
    } catch (e: any) {
      if (e?.code === "RVB_DM_ALREADY_EXISTS" || e?.message?.includes("already")) {
        // Try to find existing DM via search
        Alert.alert("DM exists", "Conversation already exists, opening chats");
        router.push("/(app)/secondary-chats" as any);
      } else {
        Alert.alert("Failed", e?.message || "Could not start DM");
      }
    }
  };

  return (
    <Screen padded={false}>
      <AppHeader title="Directory" subtitle="Search by @tag or role" showNotifications />
      <View style={{ padding: 16, backgroundColor: theme.colors.background }}>
        <View style={{ marginTop: 4 }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search @tag or name" />
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {ROLES.map((r) => (
            <Pressable key={r || "all"} onPress={() => setRole(r)} style={[styles.chip, { borderColor: role === r ? theme.colors.primary : theme.colors.border, backgroundColor: role === r ? theme.colors.primarySoft : theme.colors.surface }]}>
              <Text style={[styles.chipText, { color: role === r ? theme.colors.primary : theme.colors.textSecondary }]}>{r || "All"}</Text>
            </Pressable>
          ))}
        </View>
        {error ? (
          <View style={{ marginTop: 8 }}>
            <ErrorState title="Error" message={error} onRetry={search} />
          </View>
        ) : null}
      </View>
      {loading && results.length === 0 ? (
        <Loading message="Searching..." />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item, idx) => item.id || item.accountId || String(idx)}
          contentContainerStyle={{ padding: 16, paddingTop: 0 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); search(true); }} />}
          ListEmptyComponent={<Empty title="No results" message={query ? "Try different search" : "Start typing to search directory"} />}
          ListFooterComponent={
            hasMore && results.length >= 20 ? (
              <Pressable onPress={() => search(false)} style={[styles.loadMore, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                <Text style={[styles.loadMoreText, { color: theme.colors.primary }]}>Load More</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            const tag = item.tag || item.accountId || "";
            const name = item.displayName || item.name || tag;
            const r = item.role || "user";
            return (
              <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
                <View style={[styles.row, rtl && { flexDirection: "row-reverse" }]}>
                  <Avatar uri={item.profilePicture || null} name={name} size={44} />
                  <View style={[styles.info, rtl && { alignItems: "flex-end", marginLeft: 0, marginRight: 10 }]}>
                    <Text style={[styles.name, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>{name}</Text>
                    <Text style={[styles.tag, { color: theme.colors.primary }, rtl && { textAlign: "right" }]}>@{tag}</Text>
                    <Text style={[styles.role, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{r}</Text>
                  </View>
                  <Pressable onPress={() => handleDM(item)} style={[styles.dmBtn, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]}>
                    <Text style={[styles.dmText, { color: theme.colors.primary }]}>DM</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  card: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  info: { flex: 1, marginLeft: 10 },
  name: { fontWeight: "700", fontSize: 14 },
  tag: { fontSize: 12, fontWeight: "600", marginTop: 1 },
  role: { fontSize: 11, marginTop: 2, textTransform: "capitalize" },
  dmBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  dmText: { fontWeight: "700", fontSize: 12 },
  loadMore: { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  loadMoreText: { fontWeight: "700", fontSize: 13 },
});
