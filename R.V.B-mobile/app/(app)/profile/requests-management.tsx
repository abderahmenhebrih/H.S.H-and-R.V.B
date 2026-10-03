import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable, Alert } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { SearchField } from "@/components/common/SearchField";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useTheme } from "@/theme/useTheme";
import { getRequests, reviewRequest } from "@/services/management.service";
import { formatDateTime, getCurrentLanguage } from "@/utils/date";
import { formatCurrency } from "@/utils/currency";
import { isRTL } from "@/i18n";

export default function RequestsManagement() {
  const { theme } = useTheme();
  const rtl = isRTL();
  const lang = getCurrentLanguage();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string>("under_review");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getRequests({ status, source, search: search.trim() || undefined, limit: 50 });
      const list = res.requests || [];
      setRequests(list);
    } catch (e: any) {
      setError(e?.message || "Failed to load requests");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, source, search]);

  useEffect(() => {
    const t = setTimeout(load, 400);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    load();
  }, []);

  const handleReview = async (r: any, newStatus: "accepted" | "rejected") => {
    Alert.alert(`${newStatus === "accepted" ? "Accept" : "Reject"} ${r.source} ${r.type}`, `${newStatus} ${r.source} request?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: newStatus === "accepted" ? "Accept" : "Reject",
        style: newStatus === "accepted" ? "default" : "destructive",
        onPress: async () => {
          try {
            await reviewRequest(r.source, r.id, { status: newStatus });
            Alert.alert("Success", `Request ${newStatus}`);
            load();
          } catch (e: any) {
            Alert.alert("Failed", e?.message || "Review failed");
          }
        },
      },
    ]);
  };

  if (loading) return <Loading message="Loading requests..." />;

  return (
    <Screen padded={false}>
      <View style={{ padding: 16, backgroundColor: theme.colors.background }}>
        <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Requests</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Worker • Supplier • Customer • price authoritative</Text>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {["under_review", "accepted", "rejected", ""].map((s) => (
            <Pressable key={s || "all"} onPress={() => setStatus(s || "under_review")} style={[styles.chip, { borderColor: status === (s || "under_review") ? theme.colors.primary : theme.colors.border, backgroundColor: status === (s || "under_review") ? theme.colors.primarySoft : theme.colors.surface }]}>
              <Text style={[styles.chipText, { color: status === (s || "under_review") ? theme.colors.primary : theme.colors.textSecondary }]}>{s ? s.replace("_", " ") : "All"}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {[undefined, "worker", "supplier", "customer"].map((src) => (
            <Pressable key={src || "all"} onPress={() => setSource(src)} style={[styles.chip, { borderColor: source === src ? theme.colors.primary : theme.colors.border, backgroundColor: source === src ? theme.colors.primarySoft : theme.colors.surface }]}>
              <Text style={[styles.chipText, { color: source === src ? theme.colors.primary : theme.colors.textSecondary }]}>{src || "All"}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ marginTop: 12 }}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search requests" />
        </View>
        {error ? (
          <View style={{ marginTop: 8 }}>
            <ErrorState title="Error" message={error} onRetry={load} />
          </View>
        ) : null}
      </View>
      <FlatList
        data={requests}
        keyExtractor={(item) => `${item.source}-${item.id}`}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Empty title="No requests" message="No requests for this filter" />}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.type, { color: theme.colors.text }]}>
                {item.source} • {item.type}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            {item.amount !== null && item.amount !== undefined ? <Text style={[styles.amount, { color: theme.colors.primary }]}>{formatCurrency(item.amount, "DA")}</Text> : null}
            {item.total ? <Text style={[styles.amount, { color: theme.colors.primary }]}>{formatCurrency(item.total, "DA")}</Text> : null}
            {item.description ? (
              <Text style={[styles.desc, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
            <Text style={[styles.date, { color: theme.colors.textTertiary }]}>{formatDateTime(item.submittedAt || item.createdAt, lang)}</Text>
            {item.status === "under_review" ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Pressable onPress={() => handleReview(item, "accepted")} style={[styles.btn, { backgroundColor: theme.colors.successSoft, borderColor: theme.colors.success }]}>
                  <Text style={[styles.btnText, { color: theme.colors.success }]}>Accept</Text>
                </Pressable>
                <Pressable onPress={() => handleReview(item, "rejected")} style={[styles.btn, { backgroundColor: theme.colors.errorSoft, borderColor: theme.colors.error }]}>
                  <Text style={[styles.btnText, { color: theme.colors.error }]}>Reject</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
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
  type: { fontWeight: "700", fontSize: 13, textTransform: "capitalize" },
  amount: { fontWeight: "700", fontSize: 13, marginTop: 4 },
  desc: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  date: { fontSize: 11, marginTop: 4 },
  btn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  btnText: { fontWeight: "700", fontSize: 12 },
});
