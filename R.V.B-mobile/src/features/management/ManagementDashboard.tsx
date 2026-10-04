import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { useTheme } from "@/theme/useTheme";
import { useAuthStore } from "@/stores/auth-store";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "@/components/common/Avatar";
import { NotificationBell } from "@/components/common/NotificationBell";
import { Card } from "@/components/common/Card";
import { Loading } from "@/components/common/Loading";
import { isRTL } from "@/i18n";
import { formatCurrency } from "@/utils/currency";
import { WorkerDashboard } from "@/features/worker/WorkerDashboard";
import { getWorkerPortal } from "@/services/worker.service";

type CardDef = { key: string; title: string; hint: string; icon: keyof typeof Ionicons.glyphMap; route: string; count?: string };

export function ManagementDashboard() {
  const { theme } = useTheme();
  const { account } = useAuthStore();
  const rtl = isRTL();
  const role = account?.role;

  // For supervisor, also show own worker profile inline
  const [workerMini, setWorkerMini] = useState<any>(null);
  useEffect(() => {
    if (role === "supervisor") {
      getWorkerPortal()
        .then((r) => setWorkerMini(r.worker))
        .catch(() => setWorkerMini(null));
    }
  }, [role]);

  const isSupervisor = role === "supervisor";
  const isManager = role === "manager" || role === "admin";

  const supervisorCards: CardDef[] = [
    { key: "customers", title: "Customers", hint: "List, create, edit, sales & orders", icon: "people", route: "/(app)/profile/customers" },
    { key: "customer-requests", title: "Customer Requests", hint: "Insert shipments & discrepancies", icon: "document-text", route: "/(app)/profile/requests-management" },
    { key: "customer-orders", title: "Customer Orders", hint: "Place orders, accept/reject", icon: "receipt", route: "/(app)/profile/orders" },
  ];

  const managerCards: CardDef[] = [
    { key: "accounts", title: "Accounts & Access", hint: "Tags, roles, linked entities", icon: "key", route: "/(app)/profile/accounts" },
    { key: "workers", title: "Workers", hint: "Create, edit, bonus/absence", icon: "briefcase", route: "/(app)/profile/workers" },
    { key: "suppliers", title: "Suppliers", hint: "Create, edit, purchases", icon: "cube", route: "/(app)/profile/suppliers" },
    { key: "customers", title: "Customers", hint: "Create, edit, sales", icon: "people", route: "/(app)/profile/customers" },
    { key: "requests", title: "Requests", hint: "Worker • Supplier • Customer", icon: "documents", route: "/(app)/profile/requests-management" },
    { key: "orders", title: "Orders", hint: "Customer orders review", icon: "receipt", route: "/(app)/profile/orders" },
  ];

  const cards = isSupervisor ? supervisorCards : managerCards;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { backgroundColor: theme.colors.background }]} refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} />}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs, rtl && { flexDirection: "row-reverse" }]}>
        <Avatar uri={account?.profilePicture || null} name={account?.displayName || "User"} size={64} />
        <View style={[styles.headerText, rtl && { alignItems: "flex-end", marginLeft: 0, marginRight: 12 }]}>
          <Text style={[styles.name, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>{account?.displayName}</Text>
          <Text style={[styles.tag, { color: theme.colors.primary }, rtl && { textAlign: "right" }]}>@{account?.tag}</Text>
          <Text style={[styles.role, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{account?.role} • {account?.status}</Text>
        </View>
        <NotificationBell />
      </View>

      {isSupervisor && workerMini ? (
        <View style={{ marginTop: 12 }}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>My Worker Profile</Text>
          <Card>
            <Text style={{ color: theme.colors.text, fontWeight: "700" }}>{workerMini.name}</Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 }}>{workerMini.position} • {workerMini.status}</Text>
            <Text style={{ color: theme.colors.primary, fontWeight: "700", marginTop: 8 }}>{formatCurrency(workerMini.balance, "DA")} Current Credit</Text>
            <Pressable onPress={() => router.push("/(app)/profile" as any)} style={{ marginTop: 10 }}>
              <Text style={{ color: theme.colors.primary, fontWeight: "600", fontSize: 13 }}>Open Worker Dashboard →</Text>
            </Pressable>
          </Card>
          {/* Inline mini worker dashboard is available via WorkerDashboard for full */}
        </View>
      ) : null}

      {isSupervisor ? (
        <View style={{ marginTop: 8 }}>
          <WorkerDashboard />
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{isSupervisor ? "Customer Management" : "Management"}</Text>
      <View style={styles.grid}>
        {cards.map((c) => (
          <Pressable key={c.key} onPress={() => router.push(c.route as any)} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs, rtl && { flexDirection: "row-reverse" }]}>
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primaryRing }]}>
              <Ionicons name={c.icon as any} size={20} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>{c.title}</Text>
              <Text style={[styles.cardHint, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{c.hint}</Text>
            </View>
            <Ionicons name={rtl ? "chevron-back" : "chevron-forward"} size={18} color={theme.colors.textTertiary} />
          </Pressable>
        ))}
      </View>

      {isManager ? (
        <View style={{ marginTop: 12 }}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Quick Stats</Text>
          <Card>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>Management boards use real backend data. Tap a card to manage.</Text>
          </Card>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 16, borderWidth: 1 },
  headerText: { marginLeft: 12, flex: 1 },
  name: { fontSize: 17, fontWeight: "800" },
  tag: { fontWeight: "600", marginTop: 2, fontSize: 13 },
  role: { fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  sectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 18, marginBottom: 8 },
  grid: { gap: 10 },
  card: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 12, borderWidth: 1, gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  cardTitle: { fontSize: 14, fontWeight: "700" },
  cardHint: { fontSize: 11, marginTop: 2, lineHeight: 14 },
});
