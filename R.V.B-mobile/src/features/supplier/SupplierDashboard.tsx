import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Alert, Platform } from "react-native";
import { Avatar } from "@/components/common/Avatar";
import { NotificationBell } from "@/components/common/NotificationBell";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { Button } from "@/components/common/Button";
import { useAuthStore } from "@/stores/auth-store";
import { getSupplierPortal, getSupplierPurchases, getSupplierPayments, getSupplierRequests, getConfig } from "@/services/supplier.service";
import type { SupplierProfile, SupplierPurchase, SupplierPayment, SupplierRequest } from "@/types/supplier";
import { formatCurrency } from "@/utils/currency";
import { formatDate, formatDateTime, getCurrentLanguage } from "@/utils/date";
import { isRTL } from "@/i18n";
import { sanitizeForSupplierPdf, buildSupplierPdfHtml } from "@/utils/pdf-supplier";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme/useTheme";

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

export function SupplierDashboard() {
  const { account } = useAuthStore();
  const { theme } = useTheme();
  const [supplier, setSupplier] = useState<SupplierProfile | null>(null);
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [requests, setRequests] = useState<SupplierRequest[]>([]);
  const [currency, setCurrency] = useState("DA");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [sRes, purRes, payRes, reqRes, cfgRes] = await Promise.all([
        getSupplierPortal(),
        getSupplierPurchases().catch(() => ({ supplierId: "", purchases: [] as any })),
        getSupplierPayments().catch((e:any) => {
          // If endpoint not available, return empty but note
          if (e?.status === 404 || e?.code === "NOT_FOUND") return { supplierId: "", payments: [] as any };
          throw e;
        }),
        getSupplierRequests(),
        getConfig().catch(() => ({ currency: "DA", config: null as any })),
      ]);
      setSupplier(sRes.supplier);
      setPurchases(purRes.purchases || []);
      setPayments(payRes.payments || []);
      setRequests(reqRes.requests || []);
      setCurrency(cfgRes.currency || "DA");
    } catch (e: any) {
      if (e?.code === "RVB_SESSION_REVOKED") setError("Session revoked. Please login again.");
      else if (e?.code === "NETWORK_ERROR") setError("Connection problem. Pull to retry.");
      else if (e?.status === 404) setError(e?.message || "Supplier not found. Check linked entity.");
      else setError(e?.message || "Failed to load supplier data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = () => { setRefreshing(true); loadAll(); };

  const rtl = isRTL();
  const lang = getCurrentLanguage();

  const handlePdf = async () => {
    if (!supplier) return;
    setPdfLoading(true);
    try {
      const sanitized = sanitizeForSupplierPdf(supplier, purchases, payments, currency);
      const html = buildSupplierPdfHtml(sanitized);
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Supplier-${supplier.name}.pdf` });
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

  if (loading) return <Loading message="Loading supplier profile..." />;
  if (error && !supplier) return <ErrorState title="Could not load supplier" message={error} onRetry={loadAll} />;
  if (!supplier) return <ErrorState title="Supplier not found" message={error || "No supplier linked to this account."} onRetry={loadAll} />;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View
        style={[
          styles.header,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          theme.shadows.xs,
          rtl && { flexDirection: "row-reverse" },
        ]}
      >
        <Avatar uri={account?.profilePicture || null} name={supplier.name} size={72} />
        <View style={[styles.headerText, rtl && { alignItems: "flex-end", marginLeft: 0, marginRight: 12 }]}>
          <Text style={[styles.name, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>{supplier.name}</Text>
          <Text style={[styles.tag, { color: theme.colors.primary }, rtl && { textAlign: "right" }]}>@{account?.tag}</Text>
          <Text style={[styles.role, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Supplier • {supplier.id.slice(0,8)}</Text>
        </View>
        <NotificationBell />
      </View>

      {error ? <View style={{ marginTop: 12 }}><ErrorState title="Connection problem" message={error} onRetry={loadAll} /></View> : null}

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Summary</Text>
      <View style={styles.summaryGrid}>
        <SummaryCard label="Current Balance" value={formatCurrency(supplier.balance, currency)} sub="Supplier.balance" />
        <SummaryCard label="Purchases" value={`${purchases.length}`} sub={purchases.length? "supplies" : "No purchases"} />
        <SummaryCard label="Payments" value={`${payments.length}`} sub={payments.length? "payments" : "No payments"} />
        <SummaryCard label="Currency" value={currency} />
      </View>

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right", marginTop: 16 }]}>Profile Details</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        <Row label="Name" value={supplier.name} />
        <Row label="Phone" value={supplier.phone} />
        <Row label="Address" value={supplier.address || "-"} />
        <Row label="ID Number" value={supplier.identificationNumber || "-"} />
        <Row label="Email" value={supplier.email || "-"} />
        <Row label="Notes" value={supplier.notes || "-"} />
        <Row label="Current Balance" value={formatCurrency(supplier.balance, currency)} />
        <Row label="Currency" value={currency} />
      </View>

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Purchase / Supply History</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        {purchases.length===0 ? <Empty title="No purchases recorded." message="Your accepted supplies will appear here as Purchases." /> : purchases.slice(0,10).map(p=>(
          <View key={p.id} style={[styles.eventRow, { borderBottomColor: theme.colors.border }]}>
            <Text style={[styles.eventType, { color: theme.colors.text }]}>{formatDate(p.date, lang)} • {formatCurrency(p.total, currency)}</Text>
            <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>{p.items.map(i=> `${i.productId} x${i.quantity} ${i.weightKg}kg @${i.price}`).join(" | ").slice(0,120)}</Text>
            <Text style={[styles.eventDate, { color: theme.colors.textTertiary }]}>ID {p.id.slice(0,8)} • {p.items.length} items</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Payment History</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        {payments.length===0 ? <Empty title="No payments recorded." message={payments.length===0 ? "Payment history is currently not available through portal or no payments yet." : ""} /> : payments.slice(0,10).map(p=>(
          <View key={p.id} style={[styles.eventRow, { borderBottomColor: theme.colors.border }]}>
            <Text style={[styles.eventType, { color: theme.colors.text }]}>{formatCurrency(p.amount, currency)}</Text>
            <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>{p.note || "Payment"}</Text>
            <Text style={[styles.eventDate, { color: theme.colors.textTertiary }]}>{formatDate(p.date, lang)}</Text>
          </View>
        ))}
      </View>

      {/* Supplier Actions — neutral management-style action cards (no legacy teal) */}
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Supplier Actions</Text>
      <View style={styles.actionsGrid}>
        <Pressable
          onPress={()=> router.push("/(app)/profile/supply" as any)}
          style={[
            styles.actionCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            theme.shadows.xs,
            rtl && { flexDirection: "row-reverse" },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>New Supply</Text>
            <Text style={[styles.actionHint, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Items: product, quantity, weight, price</Text>
          </View>
          <Ionicons name={rtl ? "chevron-back" : "chevron-forward"} size={18} color={theme.colors.primary} />
        </Pressable>
        <Pressable
          onPress={()=> router.push("/(app)/profile/supplier-discrepancy" as any)}
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

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Request History</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        {requests.length===0 ? <Empty title="No requests yet" message="Your New Supply and Discrepancy requests will appear here." /> : requests.slice(0,20).map(r=> <RequestRow key={r.id} req={r} currency={currency} lang={lang} />)}
        {requests.length>0 ? <Pressable onPress={()=> router.push("/(app)/profile/supplier-requests" as any)} style={styles.linkBtn}><Text style={[styles.linkText, { color: theme.colors.primary }]}>View all requests ({requests.length}) →</Text></Pressable> : null}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Activity</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        <Empty title="Activity via Requests" message="Supplier activity is tracked via request history and purchases. Direct Supplier activity endpoint is currently not exposed; request history remains source of truth." />
        <Pressable onPress={()=> router.push("/(app)/profile/supplier-requests" as any)} style={styles.linkBtn}><Text style={[styles.linkText, { color: theme.colors.primary }]}>View requests →</Text></Pressable>
      </View>

      {/* Export (brown primary CTA preserved) */}
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        <Text style={[styles.actionTitle, { color: theme.colors.text }]}>Export</Text>
        <Text style={[styles.actionHint, { color: theme.colors.textSecondary }]}>Generate a safe Supplier summary PDF (own information only).</Text>
        <View style={{ marginTop: 12 }}>
          <Button title={pdfLoading ? "Generating..." : "Export Supplier PDF"} onPress={handlePdf} loading={pdfLoading} />
          <Text style={[styles.pdfHint, { color: theme.colors.textTertiary }]}>Web: print preview • Native: share sheet • Sensitive fields excluded</Text>
          {Platform.OS==="web" ? <Text style={[styles.pdfHint, { color: theme.colors.textTertiary }]}>On web, allow popups for print.</Text> : null}
        </View>
      </View>

      <View style={{height:24}} />
    </ScrollView>
  );
}

function RequestRow({req, currency, lang}:{req:SupplierRequest; currency:string; lang:any}){
  const { theme } = useTheme();
  const statusColors =
    req.status==="accepted"
      ? { bg: theme.colors.statusAcceptedBg, border: theme.colors.statusAcceptedBorder, text: theme.colors.statusAcceptedText }
      : req.status==="rejected"
        ? { bg: theme.colors.statusRejectedBg, border: theme.colors.statusRejectedBorder, text: theme.colors.statusRejectedText }
        : { bg: theme.colors.statusUnderReviewBg, border: theme.colors.statusUnderReviewBorder, text: theme.colors.statusUnderReviewText };
  const statusLabel = req.status==="under_review" ? "Under Review" : req.status==="accepted" ? "Accepted" : "Rejected";
  return (
    <Pressable onPress={()=> router.push({pathname:"/(app)/profile/supplier-requests" as any, params:{id:req.id}} as any)} style={[styles.requestRow, { borderBottomColor: theme.colors.border }]}>
      <View style={{flex:1}}>
        <View style={{flexDirection:"row", alignItems:"center", gap:8}}>
          <Text style={[styles.eventType, { color: theme.colors.text }]}>{req.type}</Text>
          <View style={[styles.badge, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}><Text style={[styles.badgeText, { color: statusColors.text }]}>{statusLabel}</Text></View>
        </View>
        {req.type==="new_supply" && req.items ? <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]} numberOfLines={2}>{req.items.map(i=> `${i.productId} ${i.quantity}x ${i.weightKg}kg @${i.price}`).join(", ").slice(0,120)}</Text> : null}
        {req.total !== null && req.total !== undefined ? <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>Total: {formatCurrency(req.total, currency)} (server authoritative)</Text> : null}
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
