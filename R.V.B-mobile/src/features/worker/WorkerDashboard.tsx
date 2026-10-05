import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator, Alert } from "react-native";
import { Avatar } from "@/components/common/Avatar";
import { NotificationBell } from "@/components/common/NotificationBell";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { Button } from "@/components/common/Button";
import { useAuthStore } from "@/stores/auth-store";
import { getWorkerPortal, getWorkerFinancialEvents, getWorkerActivities, getWorkerRequests, getConfig } from "@/services/worker.service";
import type { WorkerProfile, WorkerFinancialEvent, WorkerActivity, WorkerRequest } from "@/types/worker";
import { formatCurrency } from "@/utils/currency";
import { formatDate, formatDateTime, getCurrentLanguage } from "@/utils/date";
import { isRTL } from "@/i18n";
import { sanitizeForPdf, buildWorkerPdfHtml } from "@/utils/pdf";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme/useTheme";

type Props = {
  onRefreshNeeded?: () => void;
};

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { theme } = useTheme();
  const rtl = isRTL();
  return (
    <View
      style={[
        styles.summaryCard,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        theme.shadows.xs,
        rtl && { alignItems: "flex-end" },
      ]}
    >
      <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>{value}</Text>
      {sub ? <Text style={[styles.summarySub, { color: theme.colors.textTertiary }, rtl && { textAlign: "right" }]}>{sub}</Text> : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const rtl = isRTL();
  return (
    <View
      style={[
        styles.detailRow,
        { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
        rtl && { flexDirection: "row-reverse" },
      ]}
    >
      <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.colors.text }, rtl && { textAlign: "left" }]}>{value}</Text>
    </View>
  );
}

export function WorkerDashboard() {
  const { account } = useAuthStore();
  const { theme } = useTheme();
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [events, setEvents] = useState<WorkerFinancialEvent[]>([]);
  const [activities, setActivities] = useState<WorkerActivity[]>([]);
  const [requests, setRequests] = useState<WorkerRequest[]>([]);
  const [currency, setCurrency] = useState("DA");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [wRes, eRes, aRes, rRes, cRes] = await Promise.all([
        getWorkerPortal(),
        getWorkerFinancialEvents(),
        getWorkerActivities(),
        getWorkerRequests(),
        getConfig().catch(() => ({ currency: "DA", config: null as any })),
      ]);
      setWorker(wRes.worker);
      setEvents(eRes.events);
      setActivities(aRes.activities);
      setRequests(rRes.requests);
      setCurrency(cRes.currency || "DA");
    } catch (e: any) {
      const msg = e?.message || "Failed to load worker data";
      // Distinguish network vs terminal
      if (e?.code === "RVB_SESSION_REVOKED" || e?.code === "RVB_ACCOUNT_DISABLED") {
        setError("Session revoked. Please login again.");
      } else if (e?.code === "NETWORK_ERROR" || e?.code === "TIMEOUT") {
        setError("Connection problem. Pull to retry.");
      } else if (e?.status === 404) {
        setError(e?.message || "Worker not found. Check linked entity.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAll();
  };

  const bonuses = events.filter((e) => e.type === "bonus");
  const absences = events.filter((e) => e.type === "absence");
  const bonusTotal = bonuses.reduce((s, e) => s + (e.amount || 0), 0);
  const rtl = isRTL();
  const lang = getCurrentLanguage();

  const handlePdf = async () => {
    if (!worker) return;
    setPdfLoading(true);
    try {
      const sanitized = sanitizeForPdf(worker, events, currency);
      const html = buildWorkerPdfHtml(sanitized);
      if (Platform.OS === "web") {
        // Web: expo-print prints via window.print iframe
        if (Print.printAsync) {
          await Print.printAsync({ html });
        } else {
          Alert.alert("PDF", "Print not available on this platform");
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Worker-${worker.name}.pdf` });
        } else {
          Alert.alert("PDF Generated", uri);
        }
      }
    } catch (e: any) {
      Alert.alert("PDF Failed", e?.message || "Could not generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) return <Loading message="Loading worker profile..." />;

  if (error && !worker) {
    return <ErrorState title="Could not load worker" message={error} onRetry={loadAll} />;
  }

  if (!worker) {
    return <ErrorState title="Worker not found" message={error || "No worker linked to this account."} onRetry={loadAll} />;
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {/* Header (preserved identity card, theme tokens only) */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          theme.shadows.xs,
          rtl && { flexDirection: "row-reverse" },
        ]}
      >
        <Avatar uri={account?.profilePicture || null} name={worker.name} size={72} />
        <View style={[styles.headerText, rtl && { alignItems: "flex-end", marginLeft: 0, marginRight: 12 }]}>
          <Text style={[styles.name, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>{worker.name}</Text>
          <Text style={[styles.tag, { color: theme.colors.primary }, rtl && { textAlign: "right" }]}>@{account?.tag}</Text>
          <Text style={[styles.role, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{worker.position} • {worker.status}</Text>
        </View>
        <NotificationBell />
      </View>

      {error ? (
        <View style={{ marginTop: 12 }}>
          <ErrorState title="Connection problem" message={error} onRetry={loadAll} />
        </View>
      ) : null}

      {/* Summary Cards */}
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Summary</Text>
      <View style={styles.summaryGrid}>
        <SummaryCard label="Current Credit" value={formatCurrency(worker.balance, currency)} sub="Worker.balance" />
        <SummaryCard label="Monthly Salary" value={formatCurrency(worker.monthlySalary, currency)} />
        <SummaryCard label="Starting Salary" value={formatCurrency(worker.startingSalary, currency)} />
        <SummaryCard label="Bonuses" value={bonuses.length ? `${bonuses.length} • ${formatCurrency(bonusTotal, currency)}` : "No bonuses"} sub={bonuses.length ? "total" : "No bonuses recorded."} />
        <SummaryCard label="Absences" value={`${absences.length}`} sub={absences.length ? `${absences.length} recorded` : "No absences recorded."} />
      </View>

      {/* Profile Details */}
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right", marginTop: 16 }]}>Profile Details</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        <Row label="Name" value={worker.name} />
        <Row label="Phone" value={worker.phone} />
        <Row label="Address" value={worker.address || "-"} />
        <Row label="Birth date" value={worker.birthDate ? formatDate(worker.birthDate, lang) : "-"} />
        <Row label="Employment date" value={formatDate(worker.employmentDate, lang)} />
        <Row label="Position" value={worker.position} />
        <Row label="Notes" value={worker.notes || "-"} />
        <Row label="Current Credit" value={formatCurrency(worker.balance, currency)} />
        <Row label="Currency" value={currency} />
      </View>

      {/* Bonuses */}
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Bonuses</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        {bonuses.length === 0 ? (
          <Empty title="No bonuses recorded." message="Bonuses will appear here when management grants them." />
        ) : (
          bonuses.slice(0, 10).map((b) => (
            <View key={b.id} style={[styles.eventRow, { borderBottomColor: theme.colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eventType, { color: theme.colors.text }]}>Bonus • {formatCurrency(b.amount, currency)}</Text>
                <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>{b.note || "Bonus"}</Text>
                <Text style={[styles.eventDate, { color: theme.colors.textTertiary }]}>{formatDate(b.createdAt, lang)}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Absences */}
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Absences</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        {absences.length === 0 ? (
          <Empty title="No absences recorded." message="Absence history will appear here." />
        ) : (
          absences.slice(0, 10).map((a) => (
            <View key={a.id} style={[styles.eventRow, { borderBottomColor: theme.colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eventType, { color: theme.colors.text }]}>Absence</Text>
                <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>{a.note || "Absence"}</Text>
                <Text style={[styles.eventDate, { color: theme.colors.textTertiary }]}>{formatDate(a.createdAt, lang)}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Financial History */}
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Financial History</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        {events.length === 0 ? (
          <Empty title="No financial events" message="Payments, loans, bonuses and adjustments will appear here." />
        ) : (
          events.slice(0, 15).map((e) => (
            <View key={e.id} style={[styles.eventRow, { borderBottomColor: theme.colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eventType, { color: theme.colors.text }]}>
                  {e.type} • {formatCurrency(e.amount, currency)}
                </Text>
                <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>{e.note || e.type}</Text>
                <Text style={[styles.eventDate, { color: theme.colors.textTertiary }]}>
                  {formatDateTime(e.createdAt, lang)} • {e.balanceBefore} → {e.balanceAfter} {currency}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Worker Actions — neutral management-style action cards (no legacy teal) */}
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Worker Actions</Text>
      <View style={styles.actionsGrid}>
        <Pressable
          onPress={() => router.push("/(app)/profile/payment" as any)}
          style={[
            styles.actionCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            theme.shadows.xs,
            rtl && { flexDirection: "row-reverse" },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Payment Request</Text>
            <Text style={[styles.actionHint, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Amount ≤ Current Credit</Text>
          </View>
          <Ionicons name={rtl ? "chevron-back" : "chevron-forward"} size={18} color={theme.colors.primary} />
        </Pressable>
        <Pressable
          onPress={() => router.push("/(app)/profile/loan" as any)}
          style={[
            styles.actionCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            theme.shadows.xs,
            rtl && { flexDirection: "row-reverse" },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Loan Application</Text>
            <Text style={[styles.actionHint, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Amount {" > "} Current Credit</Text>
          </View>
          <Ionicons name={rtl ? "chevron-back" : "chevron-forward"} size={18} color={theme.colors.primary} />
        </Pressable>
        <Pressable
          onPress={() => router.push("/(app)/profile/discrepancy" as any)}
          style={[
            styles.actionCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            theme.shadows.xs,
            rtl && { flexDirection: "row-reverse" },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Discrepancy Report</Text>
            <Text style={[styles.actionHint, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Description ≤2000 chars</Text>
          </View>
          <Ionicons name={rtl ? "chevron-back" : "chevron-forward"} size={18} color={theme.colors.primary} />
        </Pressable>
      </View>

      {/* Request History (inline) */}
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Request History</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        {requests.length === 0 ? (
          <Empty title="No requests yet" message="Your payment, loan and discrepancy requests will appear here." />
        ) : (
          requests.slice(0, 20).map((r) => <RequestRow key={r.id} req={r} currency={currency} lang={lang} />)
        )}
        {requests.length > 0 ? (
          <Pressable onPress={() => router.push("/(app)/profile/requests" as any)} style={styles.linkBtn}>
            <Text style={[styles.linkText, { color: theme.colors.primary }]}>View all requests ({requests.length}) →</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Activity Center (inline) */}
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Activity Center</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        {activities.length === 0 ? (
          <Empty title="No activity yet" message="Request submissions, approvals and financial events will appear here." />
        ) : (
          activities.slice(0, 10).map((a) => (
            <View key={a.id} style={[styles.eventRow, { borderBottomColor: theme.colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eventType, { color: theme.colors.text }]}>{a.action}</Text>
                <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>{a.details || "-"}</Text>
                <Text style={[styles.eventDate, { color: theme.colors.textTertiary }]}>{formatDateTime(a.createdAt, lang)}</Text>
              </View>
            </View>
          ))
        )}
        <Pressable onPress={() => router.push("/(app)/profile/activity" as any)} style={styles.linkBtn}>
          <Text style={[styles.linkText, { color: theme.colors.primary }]}>View all activity ({activities.length}) →</Text>
        </Pressable>
      </View>

      {/* PDF Export (brown primary CTA preserved) */}
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        <Text style={[styles.actionTitle, { color: theme.colors.text }]}>Export</Text>
        <Text style={[styles.actionHint, { color: theme.colors.textSecondary }]}>Generate a safe Worker summary PDF (own information only, no tokens/IDs).</Text>
        <View style={{ marginTop: 12 }}>
          <Button title={pdfLoading ? "Generating..." : "Export Worker PDF"} onPress={handlePdf} loading={pdfLoading} />
          <Text style={[styles.pdfHint, { color: theme.colors.textTertiary }]}>Web: print preview • Native: share sheet • Sensitive fields excluded (see sanitizeForPdf)</Text>
          {Platform.OS === "web" ? <Text style={[styles.pdfHint, { color: theme.colors.textTertiary }]}>On web, allow popups for print.</Text> : null}
        </View>
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function RequestRow({ req, currency, lang }: { req: WorkerRequest; currency: string; lang: any }) {
  const { theme } = useTheme();
  const statusColors =
    req.status === "accepted"
      ? { bg: theme.colors.statusAcceptedBg, border: theme.colors.statusAcceptedBorder, text: theme.colors.statusAcceptedText }
      : req.status === "rejected"
        ? { bg: theme.colors.statusRejectedBg, border: theme.colors.statusRejectedBorder, text: theme.colors.statusRejectedText }
        : { bg: theme.colors.statusUnderReviewBg, border: theme.colors.statusUnderReviewBorder, text: theme.colors.statusUnderReviewText };
  const statusLabel = req.status === "under_review" ? "Under Review" : req.status === "accepted" ? "Accepted" : "Rejected";
  return (
    <Pressable onPress={() => router.push({ pathname: "/(app)/profile/requests" as any, params: { id: req.id } } as any)} style={[styles.requestRow, { borderBottomColor: theme.colors.border }]}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[styles.eventType, { color: theme.colors.text }]}>{req.type}</Text>
          <View style={[styles.badge, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
            <Text style={[styles.badgeText, { color: statusColors.text }]}>{statusLabel}</Text>
          </View>
        </View>
        {req.amount !== null && req.amount !== undefined ? <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>Amount: {formatCurrency(req.amount, currency)}</Text> : null}
        {req.description ? <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]} numberOfLines={2}>{req.description}</Text> : null}
        <Text style={[styles.eventDate, { color: theme.colors.textTertiary }]}>Submitted {formatDateTime(req.submittedAt, lang)}{req.reviewedAt ? ` • Reviewed ${formatDateTime(req.reviewedAt, lang)}` : ""}</Text>
        {req.notes ? <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>Review note: {req.notes}</Text> : null}
      </View>
    </Pressable>
  );
}

// Layout-only stylesheet. All colors come from theme tokens at the usage
// sites above, so light/dark modes stay consistent with the rest of the app.
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 12 },
  headerText: { marginLeft: 12, flex: 1 },
  name: { fontSize: 17, fontWeight: "800" },
  tag: { fontWeight: "600", marginTop: 2, fontSize: 13 },
  role: { fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: "700", marginTop: 18, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summaryCard: { width: "48%", borderRadius: 12, padding: 12, borderWidth: 1, minHeight: 70 },
  summaryLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  summaryValue: { marginTop: 6, fontSize: 15, fontWeight: "800" },
  summarySub: { marginTop: 2, fontSize: 11 },
  card: { borderRadius: 12, padding: 12, borderWidth: 1 },
  eventRow: { paddingVertical: 10, borderBottomWidth: 1 },
  eventType: { fontWeight: "700", fontSize: 13, textTransform: "capitalize" },
  eventNote: { fontSize: 12, marginTop: 2 },
  eventDate: { fontSize: 11, marginTop: 2 },
  actionsGrid: { gap: 10 },
  actionCard: { width: "100%", borderRadius: 12, padding: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  actionTitle: { fontWeight: "700", fontSize: 14 },
  actionHint: { fontSize: 11, marginTop: 4 },
  linkBtn: { marginTop: 10, alignItems: "center" },
  linkText: { fontWeight: "600", fontSize: 13 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  requestRow: { paddingVertical: 10, borderBottomWidth: 1 },
  pdfHint: { marginTop: 8, fontSize: 11, textAlign: "center" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 8, borderBottomWidth: 1 },
  detailLabel: { fontSize: 13, fontWeight: "600", flex: 1 },
  detailValue: { fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
});
