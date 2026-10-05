import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { Screen } from "@/components/common/Screen";
import { getWorkerActivities } from "@/services/worker.service";
import { api } from "@/api/client";
import type { WorkerActivity } from "@/types/worker";
import { formatDateTime, getCurrentLanguage } from "@/utils/date";
import { isRTL } from "@/i18n";
import { router } from "expo-router";
import { useTheme } from "@/theme/useTheme";
import { useAuthStore } from "@/stores/auth-store";

export default function ActivityScreen() {
  const { theme } = useTheme();
  const account = useAuthStore((s) => s.account);
  const role = account?.role;
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const lang = getCurrentLanguage();
  const rtl = isRTL();

  const load = useCallback(async () => {
    setError(null);
    try {
      if (role === "manager" || role === "supervisor") {
        // General activities for management (filtered by role)
        const res = await api.get<{ success: boolean; activities: any[] }>("/api/rvb/activities?limit=50");
        setActivities(res.activities || []);
      } else {
        const res = await getWorkerActivities();
        setActivities(res.activities);
      }
    } catch (e: any) {
      if (e?.code === "NETWORK_ERROR") setError("Connection problem. Pull to retry.");
      else setError(e?.message || "Failed to load activity");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handlePress = (a: WorkerActivity) => {
    // If navigable source is request, open requests
    if (a.action.includes("request")) {
      router.push("/(app)/profile/requests" as any);
    }
  };

  if (loading) return <Loading message="Loading activity..." />;
  if (error && activities.length === 0) return <ErrorState title="Could not load activity" message={error} onRetry={load} />;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={[styles.content, { backgroundColor: theme.colors.background }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Activity Center</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Chronological activity from backend (no fake events).</Text>
        {error ? (
          <View style={{ marginTop: 8 }}>
            <ErrorState title="Connection problem" message={error} onRetry={load} />
          </View>
        ) : null}
        {activities.length === 0 ? (
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Empty title="No activity yet" message="Request submissions, approvals, bonuses, absences and financial events will appear here." />
          </View>
        ) : (
          activities.map((a) => (
            <Pressable key={a.id} onPress={() => handlePress(a)} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={[styles.icon, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.iconText}>{String(a.action || "ac").slice(0, 2).toUpperCase()}</Text>
                </View>
                <Text style={[styles.action, { color: theme.colors.text }]}>{a.action}</Text>
              </View>
              {a.details ? <Text style={[styles.details, { color: theme.colors.textSecondary }]}>{a.details}</Text> : null}
              <Text style={[styles.date, { color: theme.colors.textTertiary }]}>
                {formatDateTime(a.createdAt, lang)} {a.actorTag ? `• @${a.actorTag}` : ""}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { marginTop: 4, fontSize: 12 },
  card: { marginTop: 12, borderRadius: 12, padding: 12, borderWidth: 1 },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  iconText: { color: "#FCF6EF", fontSize: 10, fontWeight: "700" },
  action: { fontWeight: "700", fontSize: 13 },
  details: { marginTop: 6, fontSize: 12, lineHeight: 16 },
  date: { marginTop: 4, fontSize: 11 },
});
