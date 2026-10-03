import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useTheme } from "@/theme/useTheme";
import { getWorkerRequests } from "@/services/worker.service";
import { formatCurrency } from "@/utils/currency";
import { formatDateTime, getCurrentLanguage } from "@/utils/date";
import { isRTL } from "@/i18n";

export default function WorkerRequestsScreen() {
  const { theme } = useTheme();
  const rtl = isRTL();
  const lang = getCurrentLanguage();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getWorkerRequests();
      setRequests(res.requests || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load requests");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading message="Loading requests..." />;
  if (error && requests.length === 0) return <ErrorState title="Could not load requests" message={error} onRetry={load} />;

  return (
    <Screen padded={false}>
      <View style={{ padding: 16, backgroundColor: theme.colors.background }}>
        <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>My Requests</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Payment • Loan • Discrepancy</Text>
      </View>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Empty title="No requests" message="Your payment, loan and discrepancy requests will appear here." />}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.type, { color: theme.colors.text }]}>{item.type}</Text>
              <StatusBadge status={item.status} />
            </View>
            {item.amount ? <Text style={[styles.amount, { color: theme.colors.primary }]}>{formatCurrency(item.amount, "DA")}</Text> : null}
            {item.description ? <Text style={[styles.desc, { color: theme.colors.textSecondary }]} numberOfLines={2}>{item.description}</Text> : null}
            <Text style={[styles.date, { color: theme.colors.textTertiary }]}>Submitted {formatDateTime(item.submittedAt, lang)}{item.reviewedAt ? ` • Reviewed ${formatDateTime(item.reviewedAt, lang)}` : ""}</Text>
            {item.notes ? <Text style={[styles.desc, { color: theme.colors.textSecondary }]}>Review note: {item.notes}</Text> : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 4 },
  card: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 10 },
  type: { fontWeight: "700", fontSize: 14, textTransform: "capitalize" },
  amount: { fontWeight: "700", fontSize: 13, marginTop: 4 },
  desc: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  date: { fontSize: 11, marginTop: 4 },
});
