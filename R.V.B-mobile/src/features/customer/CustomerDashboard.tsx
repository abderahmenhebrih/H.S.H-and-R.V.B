import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Alert, Platform } from "react-native";
import { Avatar } from "@/components/common/Avatar";
import { NotificationBell } from "@/components/common/NotificationBell";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { Button } from "@/components/common/Button";
import { useAuthStore } from "@/stores/auth-store";
import { getCustomerPortal, getCustomerSales, getCustomerPayments, getCustomerRequests, getOrders, getConfig } from "@/services/customer.service";
import type { CustomerProfile, CustomerSale, CustomerPayment, CustomerOrder, CustomerRequest } from "@/types/customer";
import { formatCurrency } from "@/utils/currency";
import { formatDate, formatDateTime, getCurrentLanguage } from "@/utils/date";
import { isRTL } from "@/i18n";
import { sanitizeForCustomerPdf, buildCustomerPdfHtml } from "@/utils/pdf-customer";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme/useTheme";
import type { AppTheme } from "@/theme/light";

// Status badge colors from theme tokens (light/dark aware). Semantic only.
function statusColorsFor(status: string, theme: AppTheme) {
  if (status === "accepted") {
    return { bg: theme.colors.statusAcceptedBg, border: theme.colors.statusAcceptedBorder, text: theme.colors.statusAcceptedText };
  }
  if (status === "rejected") {
    return { bg: theme.colors.statusRejectedBg, border: theme.colors.statusRejectedBorder, text: theme.colors.statusRejectedText };
  }
  if (status === "cancelled") {
    return { bg: theme.colors.statusCancelledBg, border: theme.colors.statusCancelledBorder, text: theme.colors.statusCancelledText };
  }
  return { bg: theme.colors.statusUnderReviewBg, border: theme.colors.statusUnderReviewBorder, text: theme.colors.statusUnderReviewText };
}

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

export function CustomerDashboard() {
  const { account } = useAuthStore();
  const { theme } = useTheme();
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [sales, setSales] = useState<CustomerSale[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [currency, setCurrency] = useState("DA");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [cRes, salesRes, payRes, ordersRes, reqRes, cfgRes] = await Promise.all([
        getCustomerPortal(),
        getCustomerSales().catch(() => ({ customerId: "", sales: [] as any })),
        getCustomerPayments().catch(() => ({ customerId: "", payments: [] as any })),
        getOrders().catch(() => ({ orders: [] as any })),
        getCustomerRequests().catch(() => ({ requests: [] as any })),
        getConfig().catch(() => ({ currency: "DA", config: null as any })),
      ]);
      setCustomer(cRes.customer);
      setSales(salesRes.sales || []);
      setPayments(payRes.payments || []);
      setOrders(ordersRes.orders || []);
      setRequests(reqRes.requests || []);
      setCurrency(cfgRes.currency || "DA");
    } catch (e: any) {
      if (e?.code === "RVB_SESSION_REVOKED") setError("Session revoked. Please login again.");
      else if (e?.code === "NETWORK_ERROR") setError("Connection problem. Pull to retry.");
      else if (e?.status === 404) setError(e?.message || "Customer not found.");
      else setError(e?.message || "Failed to load customer data");
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
    if (!customer) return;
    setPdfLoading(true);
    try {
      const sanitized = sanitizeForCustomerPdf(customer, sales, payments, orders, currency);
      const html = buildCustomerPdfHtml(sanitized);
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Customer-${customer.name}.pdf` });
        } else Alert.alert("PDF Generated", uri);
      }
    } catch (e: any) {
      Alert.alert("PDF Failed", e?.message || "Could not generate PDF");
    } finally { setPdfLoading(false); }
  };

  if (loading) return <Loading message="Loading customer profile..." />;
  if (error && !customer) return <ErrorState title="Could not load customer" message={error} onRetry={loadAll} />;
  if (!customer) return <ErrorState title="Customer not found" message={error || "No customer linked."} onRetry={loadAll} />;

  const underReviewOrders = orders.filter(o => o.status==="under_review").length;

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
        <Avatar uri={account?.profilePicture || null} name={customer.name} size={72} />
        <View style={[styles.headerText, rtl && { alignItems: "flex-end", marginLeft: 0, marginRight: 12 }]}>
          <Text style={[styles.name, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>{customer.name}</Text>
          <Text style={[styles.tag, { color: theme.colors.primary }, rtl && { textAlign: "right" }]}>@{account?.tag}</Text>
          <Text style={[styles.role, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{customer.type} • {customer.id.slice(0,8)}</Text>
        </View>
        <NotificationBell />
      </View>

      {error ? <View style={{ marginTop: 12 }}><ErrorState title="Connection problem" message={error} onRetry={loadAll} /></View> : null}

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Summary</Text>
      <View style={styles.summaryGrid}>
        <SummaryCard label="Current Balance" value={formatCurrency(customer.balance, currency)} sub="Customer.balance" />
        <SummaryCard label="Sales" value={`${sales.length}`} sub={sales.length? "shipments" : "No sales"} />
        <SummaryCard label="Orders" value={`${orders.length}`} sub={underReviewOrders? `${underReviewOrders} under review` : "No orders"} />
        <SummaryCard label="Requests" value={`${requests.length}`} sub={requests.length? "shipments/discrepancies" : "No requests"} />
      </View>

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right", marginTop: 16 }]}>Profile Details</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        <Row label="Name" value={customer.name} />
        <Row label="Phone" value={customer.phone} />
        <Row label="Address" value={customer.address || "-"} />
        <Row label="Type" value={customer.type} />
        <Row label="ID Number" value={customer.identificationNumber || "-"} />
        <Row label="Email" value={customer.email || "-"} />
        <Row label="Notes" value={customer.notes || "-"} />
        <Row label="Balance" value={formatCurrency(customer.balance, currency)} />
        <Row label="Currency" value={currency} />
      </View>

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Sales / Shipment History</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        {sales.length===0 ? <Empty title="No sales recorded." message="Accepted shipments will appear here as Sales." /> : sales.slice(0,10).map(s=>(
          <View key={s.id} style={[styles.eventRow, { borderBottomColor: theme.colors.border }]}>
            <Text style={[styles.eventType, { color: theme.colors.text }]}>{formatDate(s.date, lang)} • {formatCurrency(s.total, currency)}</Text>
            <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>{s.items.map(i=> `${i.productId} x${i.quantity} ${i.weightKg}kg @${i.price}`).join(" | ").slice(0,120)}</Text>
            <Text style={[styles.eventDate, { color: theme.colors.textTertiary }]}>ID {s.id.slice(0,8)} • {s.items.length} items</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Payment History</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        {payments.length===0 ? <Empty title="No payments recorded." message="Payments will appear here." /> : payments.slice(0,10).map(p=>(
          <View key={p.id} style={[styles.eventRow, { borderBottomColor: theme.colors.border }]}>
            <Text style={[styles.eventType, { color: theme.colors.text }]}>{formatCurrency(p.amount, currency)}</Text>
            <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>{p.note || "Payment"}</Text>
            <Text style={[styles.eventDate, { color: theme.colors.textTertiary }]}>{formatDate(p.date, lang)}</Text>
          </View>
        ))}
      </View>

      {/* Customer Actions — neutral management-style action cards (no legacy teal) */}
      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Customer Actions</Text>
      <View style={styles.actionsGrid}>
        <Pressable
          onPress={()=> router.push("/(app)/profile/insert-shipment" as any)}
          style={[
            styles.actionCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            theme.shadows.xs,
            rtl && { flexDirection: "row-reverse" },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Insert Shipment</Text>
            <Text style={[styles.actionHint, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Server price authoritative</Text>
          </View>
          <Ionicons name={rtl ? "chevron-back" : "chevron-forward"} size={18} color={theme.colors.primary} />
        </Pressable>
        <Pressable
          onPress={()=> router.push("/(app)/profile/place-order" as any)}
          style={[
            styles.actionCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            theme.shadows.xs,
            rtl && { flexDirection: "row-reverse" },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Place Order</Text>
            <Text style={[styles.actionHint, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Edit/Cancel while Under Review</Text>
          </View>
          <Ionicons name={rtl ? "chevron-back" : "chevron-forward"} size={18} color={theme.colors.primary} />
        </Pressable>
        <Pressable
          onPress={()=> router.push("/(app)/profile/customer-discrepancy" as any)}
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

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Orders</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        {orders.length===0 ? <Empty title="No orders yet" message="Your placed orders will appear here." /> : orders.slice(0,10).map(o=>{
          const sc = statusColorsFor(o.status, theme);
          return (
          <Pressable key={o.id} onPress={()=> router.push("/(app)/profile/customer-orders" as any)} style={[styles.orderRow, { borderBottomColor: theme.colors.border }]}>
            <View style={{flexDirection:"row", alignItems:"center", gap:8}}>
              <Text style={[styles.eventType, { color: theme.colors.text }]}>Order {o.id.slice(0,8)}</Text>
              <View style={[styles.badge, { backgroundColor: sc.bg, borderColor: sc.border }]}><Text style={[styles.badgeText, { color: sc.text }]}>{o.status==="under_review" ? "Under Review" : o.status.charAt(0).toUpperCase()+o.status.slice(1)}</Text></View>
            </View>
            <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>Total {formatCurrency(o.total, currency)} • {o.items.length} items</Text>
            <Text style={[styles.eventDate, { color: theme.colors.textTertiary }]}>Submitted {formatDateTime(o.submittedAt, lang)}{o.reviewedAt? ` • Reviewed ${formatDateTime(o.reviewedAt, lang)}`:""}</Text>
          </Pressable>
          );
        })}
        {orders.length>0 ? <Pressable onPress={()=> router.push("/(app)/profile/customer-orders" as any)} style={styles.linkBtn}><Text style={[styles.linkText, { color: theme.colors.primary }]}>View all orders ({orders.length}) →</Text></Pressable> : null}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Request History</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        {requests.length===0 ? <Empty title="No requests yet" message="Insert Shipment and Discrepancy requests will appear here." /> : requests.slice(0,10).map(r=>{
          const sc = statusColorsFor(r.status, theme);
          return (
          <View key={r.id} style={[styles.eventRow, { borderBottomColor: theme.colors.border }]}>
            <View style={{flexDirection:"row", alignItems:"center", gap:8}}>
              <Text style={[styles.eventType, { color: theme.colors.text }]}>{r.type}</Text>
              <View style={[styles.badge, { backgroundColor: sc.bg, borderColor: sc.border }]}><Text style={[styles.badgeText, { color: sc.text }]}>{r.status==="under_review" ? "Under Review" : r.status.charAt(0).toUpperCase()+r.status.slice(1)}</Text></View>
            </View>
            {r.total!==null && r.total!==undefined ? <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]}>Total {formatCurrency(r.total, currency)} (server)</Text> : null}
            {r.description ? <Text style={[styles.eventNote, { color: theme.colors.textSecondary }]} numberOfLines={2}>{r.description}</Text> : null}
            <Text style={[styles.eventDate, { color: theme.colors.textTertiary }]}>Submitted {formatDateTime(r.submittedAt, lang)}</Text>
          </View>
          );
        })}
        <Pressable onPress={()=> router.push("/(app)/profile/customer-requests" as any)} style={styles.linkBtn}><Text style={[styles.linkText, { color: theme.colors.primary }]}>View all requests ({requests.length}) →</Text></Pressable>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Activity</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        <Empty title="Activity via Requests & Orders" message="Customer activity is tracked via request/order history and sales. Direct Customer activity endpoint is not dedicated; request history remains source of truth." />
      </View>

      {/* Export (brown primary CTA preserved) */}
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
        <Text style={[styles.actionTitle, { color: theme.colors.text }]}>Export</Text>
        <Text style={[styles.actionHint, { color: theme.colors.textSecondary }]}>Generate a safe Customer summary PDF (own information only).</Text>
        <View style={{ marginTop: 12 }}>
          <Button title={pdfLoading ? "Generating..." : "Export Customer PDF"} onPress={handlePdf} loading={pdfLoading} />
          <Text style={[styles.pdfHint, { color: theme.colors.textTertiary }]}>Web: print preview • Native: share sheet • Sensitive fields excluded</Text>
          {Platform.OS==="web" ? <Text style={[styles.pdfHint, { color: theme.colors.textTertiary }]}>On web, allow popups for print.</Text> : null}
        </View>
      </View>

      <View style={{height:24}} />
    </ScrollView>
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
  orderRow: { paddingVertical: 10, borderBottomWidth: 1 },
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
  pdfHint: { marginTop: 8, fontSize: 11, textAlign: "center" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 8, borderBottomWidth: 1 },
  detailLabel: { fontSize: 13, fontWeight: "600", flex: 1 },
  detailValue: { fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
});
