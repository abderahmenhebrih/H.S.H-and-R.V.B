import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator, Alert } from "react-native";
import { Avatar } from "@/components/common/Avatar";
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

type Props = {
  onRefreshNeeded?: () => void;
};

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const rtl = isRTL();
  return (
    <View style={[styles.summaryCard, rtl && { alignItems: "flex-end" }]}>
      <Text style={[styles.summaryLabel, rtl && { textAlign: "right" }]}>{label}</Text>
      <Text style={[styles.summaryValue, rtl && { textAlign: "right" }]}>{value}</Text>
      {sub ? <Text style={[styles.summarySub, rtl && { textAlign: "right" }]}>{sub}</Text> : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const rtl = isRTL();
  return (
    <View style={[rowStyles.row, rtl && { flexDirection: "row-reverse" }]}>
      <Text style={[rowStyles.label, rtl && { textAlign: "right" }]}>{label}</Text>
      <Text style={[rowStyles.value, rtl && { textAlign: "left" }]}>{value}</Text>
    </View>
  );
}

export function WorkerDashboard() {
  const { account } = useAuthStore();
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
      {/* Header */}
      <View style={[styles.header, rtl && { flexDirection: "row-reverse" }]}>
        <Avatar uri={account?.profilePicture || null} name={worker.name} size={72} />
        <View style={[styles.headerText, rtl && { alignItems: "flex-end", marginLeft: 0, marginRight: 12 }]}>
          <Text style={[styles.name, rtl && { textAlign: "right" }]}>{worker.name}</Text>
          <Text style={[styles.tag, rtl && { textAlign: "right" }]}>@{account?.tag}</Text>
          <Text style={[styles.role, rtl && { textAlign: "right" }]}>{worker.position} • {worker.status}</Text>
        </View>
      </View>

      {error ? (
        <View style={{ marginTop: 12 }}>
          <ErrorState title="Connection problem" message={error} onRetry={loadAll} />
        </View>
      ) : null}

      {/* Summary Cards */}
      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Summary</Text>
      <View style={styles.summaryGrid}>
        <SummaryCard label="Current Credit" value={formatCurrency(worker.balance, currency)} sub="Worker.balance" />
        <SummaryCard label="Monthly Salary" value={formatCurrency(worker.monthlySalary, currency)} />
        <SummaryCard label="Starting Salary" value={formatCurrency(worker.startingSalary, currency)} />
        <SummaryCard label="Bonuses" value={bonuses.length ? `${bonuses.length} • ${formatCurrency(bonusTotal, currency)}` : "No bonuses"} sub={bonuses.length ? "total" : "No bonuses recorded."} />
        <SummaryCard label="Absences" value={`${absences.length}`} sub={absences.length ? `${absences.length} recorded` : "No absences recorded."} />
      </View>

      {/* Profile Details */}
      <Text style={[styles.sectionTitle, rtl && { textAlign: "right", marginTop: 16 }]}>Profile Details</Text>
      <View style={styles.card}>
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
      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Bonuses</Text>
      <View style={styles.card}>
        {bonuses.length === 0 ? (
          <Empty title="No bonuses recorded." message="Bonuses will appear here when management grants them." />
        ) : (
          bonuses.slice(0, 10).map((b) => (
            <View key={b.id} style={styles.eventRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventType}>Bonus • {formatCurrency(b.amount, currency)}</Text>
                <Text style={styles.eventNote}>{b.note || "Bonus"}</Text>
                <Text style={styles.eventDate}>{formatDate(b.createdAt, lang)}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Absences */}
      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Absences</Text>
      <View style={styles.card}>
        {absences.length === 0 ? (
          <Empty title="No absences recorded." message="Absence history will appear here." />
        ) : (
          absences.slice(0, 10).map((a) => (
            <View key={a.id} style={styles.eventRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventType}>Absence</Text>
                <Text style={styles.eventNote}>{a.note || "Absence"}</Text>
                <Text style={styles.eventDate}>{formatDate(a.createdAt, lang)}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Financial History */}
      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Financial History</Text>
      <View style={styles.card}>
        {events.length === 0 ? (
          <Empty title="No financial events" message="Payments, loans, bonuses and adjustments will appear here." />
        ) : (
          events.slice(0, 15).map((e) => (
            <View key={e.id} style={styles.eventRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventType}>
                  {e.type} • {formatCurrency(e.amount, currency)}
                </Text>
                <Text style={styles.eventNote}>{e.note || e.type}</Text>
                <Text style={styles.eventDate}>
                  {formatDateTime(e.createdAt, lang)} • {e.balanceBefore} → {e.balanceAfter} {currency}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Worker Actions */}
      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Worker Actions</Text>
      <View style={styles.actionsGrid}>
        <Pressable style={styles.actionCard} onPress={() => router.push("/(app)/profile/payment" as any)}>
          <Text style={styles.actionTitle}>Payment Request</Text>
          <Text style={styles.actionHint}>Amount ≤ Current Credit</Text>
        </Pressable>
        <Pressable style={styles.actionCard} onPress={() => router.push("/(app)/profile/loan" as any)}>
          <Text style={styles.actionTitle}>Loan Application</Text>
          <Text style={styles.actionHint}>Amount {" > "} Current Credit</Text>
        </Pressable>
        <Pressable style={styles.actionCard} onPress={() => router.push("/(app)/profile/discrepancy" as any)}>
          <Text style={styles.actionTitle}>Discrepancy Report</Text>
          <Text style={styles.actionHint}>Description ≤2000 chars</Text>
        </Pressable>
      </View>

      {/* Request History (inline) */}
      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Request History</Text>
      <View style={styles.card}>
        {requests.length === 0 ? (
          <Empty title="No requests yet" message="Your payment, loan and discrepancy requests will appear here." />
        ) : (
          requests.slice(0, 20).map((r) => <RequestRow key={r.id} req={r} currency={currency} lang={lang} />)
        )}
        {requests.length > 0 ? (
          <Pressable onPress={() => router.push("/(app)/profile/requests" as any)} style={styles.linkBtn}>
            <Text style={styles.linkText}>View all requests ({requests.length}) →</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Activity Center (inline) */}
      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Activity Center</Text>
      <View style={styles.card}>
        {activities.length === 0 ? (
          <Empty title="No activity yet" message="Request submissions, approvals and financial events will appear here." />
        ) : (
          activities.slice(0, 10).map((a) => (
            <View key={a.id} style={styles.eventRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventType}>{a.action}</Text>
                <Text style={styles.eventNote}>{a.details || "-"}</Text>
                <Text style={styles.eventDate}>{formatDateTime(a.createdAt, lang)}</Text>
              </View>
            </View>
          ))
        )}
        <Pressable onPress={() => router.push("/(app)/profile/activity" as any)} style={styles.linkBtn}>
          <Text style={styles.linkText}>View all activity ({activities.length}) →</Text>
        </Pressable>
      </View>

      {/* PDF Export */}
      <View style={styles.card}>
        <Text style={styles.actionTitle}>Export</Text>
        <Text style={styles.actionHint}>Generate a safe Worker summary PDF (own information only, no tokens/IDs).</Text>
        <View style={{ marginTop: 12 }}>
          <Button title={pdfLoading ? "Generating..." : "Export Worker PDF"} onPress={handlePdf} loading={pdfLoading} />
          <Text style={styles.pdfHint}>Web: print preview • Native: share sheet • Sensitive fields excluded (see sanitizeForPdf)</Text>
          {Platform.OS === "web" ? <Text style={styles.pdfHint}>On web, allow popups for print.</Text> : null}
        </View>
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function RequestRow({ req, currency, lang }: { req: WorkerRequest; currency: string; lang: any }) {
  const statusStyle = req.status === "accepted" ? styles.badgeAccepted : req.status === "rejected" ? styles.badgeRejected : styles.badgeReview;
  const statusLabel = req.status === "under_review" ? "Under Review" : req.status === "accepted" ? "Accepted" : "Rejected";
  return (
    <Pressable onPress={() => router.push({ pathname: "/(app)/profile/requests" as any, params: { id: req.id } } as any)} style={styles.requestRow}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.eventType}>{req.type}</Text>
          <View style={[styles.badge, statusStyle]}>
            <Text style={styles.badgeText}>{statusLabel}</Text>
          </View>
        </View>
        {req.amount !== null && req.amount !== undefined ? <Text style={styles.eventNote}>Amount: {formatCurrency(req.amount, currency)}</Text> : null}
        {req.description ? <Text style={styles.eventNote} numberOfLines={2}>{req.description}</Text> : null}
        <Text style={styles.eventDate}>Submitted {formatDateTime(req.submittedAt, lang)}{req.reviewedAt ? ` • Reviewed ${formatDateTime(req.reviewedAt, lang)}` : ""}</Text>
        {req.notes ? <Text style={styles.eventNote}>Review note: {req.notes}</Text> : null}
      </View>
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  label: { color: "#64748B", fontSize: 13, flex: 1 },
  value: { color: "#0F172A", fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
});

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 12 },
  headerText: { marginLeft: 12, flex: 1 },
  name: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  tag: { color: "#0F766E", fontWeight: "600", marginTop: 2, fontSize: 13 },
  role: { color: "#64748B", fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#334155", marginTop: 18, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summaryCard: { width: "48%", backgroundColor: "#fff", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", minHeight: 70 },
  summaryLabel: { fontSize: 11, color: "#64748B", fontWeight: "600", textTransform: "uppercase" },
  summaryValue: { marginTop: 6, fontSize: 15, fontWeight: "800", color: "#0F172A" },
  summarySub: { marginTop: 2, fontSize: 11, color: "#94A3B8" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  eventRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  eventType: { fontWeight: "700", color: "#0F172A", fontSize: 13, textTransform: "capitalize" },
  eventNote: { color: "#475569", fontSize: 12, marginTop: 2 },
  eventDate: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionCard: { width: "100%", backgroundColor: "#fff", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#0F766E", marginBottom: 0 },
  actionTitle: { fontWeight: "700", color: "#0F766E" },
  actionHint: { color: "#64748B", fontSize: 11, marginTop: 4 },
  linkBtn: { marginTop: 10, alignItems: "center" },
  linkText: { color: "#0F766E", fontWeight: "600", fontSize: 13 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeReview: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FDE68A" },
  badgeAccepted: { backgroundColor: "#DCFCE7", borderWidth: 1, borderColor: "#86EFAC" },
  badgeRejected: { backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#FCA5A5" },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#334155" },
  requestRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  pdfHint: { marginTop: 8, color: "#94A3B8", fontSize: 11, textAlign: "center" },
});
