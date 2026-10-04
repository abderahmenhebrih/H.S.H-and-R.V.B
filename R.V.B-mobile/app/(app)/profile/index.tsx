import React from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Avatar } from "@/components/common/Avatar";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/api/client";
import type { RvbPortalMeResponse } from "@/types/rvb";
import { WorkerDashboard } from "@/features/worker/WorkerDashboard";
import { SupplierDashboard } from "@/features/supplier/SupplierDashboard";
import { CustomerDashboard } from "@/features/customer/CustomerDashboard";
import { ManagementDashboard } from "@/features/management/ManagementDashboard";
import { useLanguage } from "@/i18n";
import { useEffect, useState } from "react";

export default function ProfileScreen() {
  const { account } = useAuthStore();

  if (account?.role === "worker") {
    return <WorkerDashboard />;
  }
  if (account?.role === "supplier") {
    return <SupplierDashboard />;
  }
  if (account?.role === "customer") {
    return <CustomerDashboard />;
  }
  if (account?.role === "supervisor" || account?.role === "manager" || account?.role === "admin") {
    return <ManagementDashboard />;
  }

  // Fallback generic
  return <GenericProfile />;
}

function GenericProfile() {
  const { account, refreshProfile } = useAuthStore();
  const { t } = useLanguage();
  const [portal, setPortal] = useState<RvbPortalMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPortal = async () => {
    setError(null);
    try {
      const res = await api.get<RvbPortalMeResponse>("/api/rvb/portal/me");
      setPortal(res);
      if (res.account) {
        const { useAuthStore: store } = await import("@/stores/auth-store");
        store.getState().setAccount(res.account as any);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load profile");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPortal();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPortal();
    refreshProfile();
  };

  if (loading) return <Loading message="Loading profile..." />;
  const displayAccount = portal?.account || account;
  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.header}>
          <Avatar uri={displayAccount?.profilePicture || null} name={displayAccount?.displayName || "User"} size={80} />
          <Text style={styles.name}>{displayAccount?.displayName}</Text>
          <Text style={styles.tag}>@{displayAccount?.tag}</Text>
          <Text style={styles.role}>{displayAccount?.role}</Text>
          {displayAccount?.onboardingStatus === "pending" ? <Text style={styles.pending}>Onboarding pending</Text> : null}
        </View>
        {error ? (
          <View style={styles.section}>
            <ErrorState title="Could not load profile" message={error} onRetry={fetchPortal} />
          </View>
        ) : null}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.account", "Account")}</Text>
          <View style={styles.card}>
            <Row label={t("profile.id", "ID")} value={displayAccount?.id || "-"} />
            <Row label={t("profile.tag", "Tag")} value={`@${displayAccount?.tag}`} />
            <Row label={t("profile.displayName", "Display name")} value={displayAccount?.displayName || "-"} />
            <Row label={t("profile.role", "Role")} value={displayAccount?.role || "-"} />
            <Row label={t("profile.status", "Status")} value={displayAccount?.status || "-"} />
            <Row label={t("profile.onboarding", "Onboarding")} value={displayAccount?.onboardingStatus || "-"} />
            {displayAccount?.linkedEntityType ? <Row label={t("profile.linkedEntity", "Linked entity")} value={`${displayAccount.linkedEntityType} ${displayAccount.linkedEntityId || ""}`.trim()} /> : null}
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("profile.linkedEntity", "Linked entity")}</Text>
          <View style={styles.card}>
            {portal?.entity ? (
              <View style={{ alignItems: "center", gap: 8 }}>
                <Avatar uri={displayAccount?.profilePicture || null} name={displayAccount?.displayName || "User"} size={56} />
                <Text style={styles.name}>{displayAccount?.displayName}</Text>
                <Text style={styles.tag}>@{displayAccount?.tag}</Text>
                <Text style={styles.role}>{displayAccount?.role} • {displayAccount?.status}</Text>
              </View>
            ) : (
              <Text style={styles.hint}>No linked entity or not available for your role.</Text>
            )}
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Management</Text>
          <View style={styles.card}>
            <Text style={styles.hint}>Profile + Management is the default landing for worker/supplier/customer. Full management features arrive in next phases. Backend enforces role checks.</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  label: { color: "#64748B", fontSize: 13 },
  value: { color: "#0F172A", fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right", marginLeft: 12 },
});

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32 },
  header: { alignItems: "center", paddingVertical: 16, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 16 },
  name: { marginTop: 12, fontSize: 18, fontWeight: "800", color: "#0F172A" },
  tag: { color: "#0F766E", fontWeight: "600", marginTop: 2 },
  role: { marginTop: 4, color: "#64748B", fontSize: 12, textTransform: "capitalize" },
  pending: { marginTop: 6, color: "#EA580C", fontSize: 12, fontWeight: "600" },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#334155", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  hint: { color: "#64748B", fontSize: 12, lineHeight: 16 },
  json: { color: "#334155", fontSize: 11, fontFamily: "monospace" },
});
