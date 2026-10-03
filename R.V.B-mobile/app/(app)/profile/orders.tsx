import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable, Alert } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { SearchField } from "@/components/common/SearchField";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useTheme } from "@/theme/useTheme";
import { getCustomerOrders, reviewCustomerOrderMgmt } from "@/services/management.service";
import { formatCurrency } from "@/utils/currency";
import { formatDateTime, getCurrentLanguage } from "@/utils/date";
import { isRTL } from "@/i18n";

export default function OrdersManagement() {
  const { theme } = useTheme();
  const rtl = isRTL();
  const lang = getCurrentLanguage();
  const [orders, setOrders] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("under_review");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getCustomerOrders(statusFilter ? { status: statusFilter } : undefined);
      setOrders(data);
      setFiltered(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!search.trim()) setFiltered(orders);
    else {
      const s = search.toLowerCase();
      setFiltered(orders.filter((o) => o.id?.toLowerCase().includes(s) || o.customerName?.toLowerCase().includes(s) || o.status?.includes(s)));
    }
  }, [search, orders]);

  const handleReview = async (order: any, status: "accepted" | "rejected") => {
    Alert.alert(`${status === "accepted" ? "Accept" : "Reject"} Order`, `${status} order ${order.id.slice(0, 8)}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: status === "accepted" ? "Accept" : "Reject",
        style: status === "accepted" ? "default" : "destructive",
        onPress: async () => {
          try {
            await reviewCustomerOrderMgmt(order.id, { status });
            Alert.alert("Success", `Order ${status}`);
            load();
          } catch (e: any) {
            Alert.alert("Failed", e?.message || "Review failed");
          }
        },
      },
    ]);
  };

  if (loading) return <Loading message="Loading orders..." />;
  if (error && orders.length === 0) return <ErrorState title="Could not load orders" message={error} onRetry={load} />;

  return (
    <Screen padded={false}>
      <View style={{ padding: 16, backgroundColor: theme.colors.background }}>
        <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Customer Orders</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Review customer orders • price authoritative</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {["under_review", "accepted", "rejected", "cancelled", ""].map((s) => (
            <Pressable key={s || "all"} onPress={() => setStatusFilter(s)} style={[styles.chip, { borderColor: statusFilter === s ? theme.colors.primary : theme.colors.border, backgroundColor: statusFilter === s ? theme.colors.primarySoft : theme.colors.surface }]}>
              <Text style={[styles.chipText, { color: statusFilter === s ? theme.colors.primary : theme.colors.textSecondary }]}>{s ? s.replace("_", " ") : "All"}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ marginTop: 12 }}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search order or customer" />
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Empty title="No orders" message={search ? "No matching orders" : "No orders for this status"} />}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.id, { color: theme.colors.text }]}>Order {item.id.slice(0, 8)}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={[styles.customer, { color: theme.colors.textSecondary }]}>{item.customerName || item.customerId?.slice(0, 8)} • {item.items?.length || 0} items</Text>
            <Text style={[styles.total, { color: theme.colors.primary }]}>{formatCurrency(item.total, "DA")}</Text>
            <Text style={[styles.date, { color: theme.colors.textTertiary }]}>Submitted {formatDateTime(item.submittedAt, lang)}</Text>
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
  id: { fontWeight: "700", fontSize: 14 },
  customer: { fontSize: 12, marginTop: 2 },
  total: { fontWeight: "700", fontSize: 13, marginTop: 6 },
  date: { fontSize: 11, marginTop: 4 },
  btn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  btnText: { fontWeight: "700", fontSize: 12 },
});
