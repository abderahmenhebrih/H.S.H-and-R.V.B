import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Alert, Platform } from "react-native";
import { Avatar } from "@/components/common/Avatar";
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

export function CustomerDashboard() {
  const { account } = useAuthStore();
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
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={[styles.header, rtl && { flexDirection: "row-reverse" }]}>
        <Avatar uri={account?.profilePicture || null} name={customer.name} size={72} />
        <View style={[styles.headerText, rtl && { alignItems: "flex-end", marginLeft: 0, marginRight: 12 }]}>
          <Text style={[styles.name, rtl && { textAlign: "right" }]}>{customer.name}</Text>
          <Text style={[styles.tag, rtl && { textAlign: "right" }]}>@{account?.tag}</Text>
          <Text style={[styles.role, rtl && { textAlign: "right" }]}>{customer.type} • {customer.id.slice(0,8)}</Text>
        </View>
      </View>

      {error ? <View style={{ marginTop: 12 }}><ErrorState title="Connection problem" message={error} onRetry={loadAll} /></View> : null}

      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Summary</Text>
      <View style={styles.summaryGrid}>
        <SummaryCard label="Current Balance" value={formatCurrency(customer.balance, currency)} sub="Customer.balance" />
        <SummaryCard label="Sales" value={`${sales.length}`} sub={sales.length? "shipments" : "No sales"} />
        <SummaryCard label="Orders" value={`${orders.length}`} sub={underReviewOrders? `${underReviewOrders} under review` : "No orders"} />
        <SummaryCard label="Requests" value={`${requests.length}`} sub={requests.length? "shipments/discrepancies" : "No requests"} />
      </View>

      <Text style={[styles.sectionTitle, rtl && { textAlign: "right", marginTop: 16 }]}>Profile Details</Text>
      <View style={styles.card}>
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

      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Sales / Shipment History</Text>
      <View style={styles.card}>
        {sales.length===0 ? <Empty title="No sales recorded." message="Accepted shipments will appear here as Sales." /> : sales.slice(0,10).map(s=>(
          <View key={s.id} style={styles.eventRow}>
            <Text style={styles.eventType}>{formatDate(s.date, lang)} • {formatCurrency(s.total, currency)}</Text>
            <Text style={styles.eventNote}>{s.items.map(i=> `${i.productId} x${i.quantity} ${i.weightKg}kg @${i.price}`).join(" | ").slice(0,120)}</Text>
            <Text style={styles.eventDate}>ID {s.id.slice(0,8)} • {s.items.length} items</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Payment History</Text>
      <View style={styles.card}>
        {payments.length===0 ? <Empty title="No payments recorded." message="Payments will appear here." /> : payments.slice(0,10).map(p=>(
          <View key={p.id} style={styles.eventRow}>
            <Text style={styles.eventType}>{formatCurrency(p.amount, currency)}</Text>
            <Text style={styles.eventNote}>{p.note || "Payment"}</Text>
            <Text style={styles.eventDate}>{formatDate(p.date, lang)}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Customer Actions</Text>
      <View style={styles.actionsGrid}>
        <Pressable style={styles.actionCard} onPress={()=> router.push("/(app)/profile/insert-shipment" as any)}>
          <Text style={styles.actionTitle}>Insert Shipment</Text>
          <Text style={styles.actionHint}>Server price authoritative</Text>
        </Pressable>
        <Pressable style={styles.actionCard} onPress={()=> router.push("/(app)/profile/place-order" as any)}>
          <Text style={styles.actionTitle}>Place Order</Text>
          <Text style={styles.actionHint}>Edit/Cancel while Under Review</Text>
        </Pressable>
        <Pressable style={styles.actionCard} onPress={()=> router.push("/(app)/profile/customer-discrepancy" as any)}>
          <Text style={styles.actionTitle}>Discrepancy Report</Text>
          <Text style={styles.actionHint}>Description ≤2000 chars</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Orders</Text>
      <View style={styles.card}>
        {orders.length===0 ? <Empty title="No orders yet" message="Your placed orders will appear here." /> : orders.slice(0,10).map(o=>(
          <Pressable key={o.id} onPress={()=> router.push("/(app)/profile/customer-orders" as any)} style={styles.orderRow}>
            <View style={{flexDirection:"row", alignItems:"center", gap:8}}>
              <Text style={styles.eventType}>Order {o.id.slice(0,8)}</Text>
              <View style={[styles.badge, o.status==="accepted"? styles.badgeAccepted : o.status==="rejected"? styles.badgeRejected : o.status==="cancelled"? styles.badgeCancelled : styles.badgeReview]}><Text style={styles.badgeText}>{o.status==="under_review" ? "Under Review" : o.status.charAt(0).toUpperCase()+o.status.slice(1)}</Text></View>
            </View>
            <Text style={styles.eventNote}>Total {formatCurrency(o.total, currency)} • {o.items.length} items</Text>
            <Text style={styles.eventDate}>Submitted {formatDateTime(o.submittedAt, lang)}{o.reviewedAt? ` • Reviewed ${formatDateTime(o.reviewedAt, lang)}`:""}</Text>
          </Pressable>
        ))}
        {orders.length>0 ? <Pressable onPress={()=> router.push("/(app)/profile/customer-orders" as any)} style={styles.linkBtn}><Text style={styles.linkText}>View all orders ({orders.length}) →</Text></Pressable> : null}
      </View>

      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Request History</Text>
      <View style={styles.card}>
        {requests.length===0 ? <Empty title="No requests yet" message="Insert Shipment and Discrepancy requests will appear here." /> : requests.slice(0,10).map(r=>(
          <View key={r.id} style={styles.eventRow}>
            <View style={{flexDirection:"row", alignItems:"center", gap:8}}>
              <Text style={styles.eventType}>{r.type}</Text>
              <View style={[styles.badge, r.status==="accepted"? styles.badgeAccepted : r.status==="rejected"? styles.badgeRejected : styles.badgeReview]}><Text style={styles.badgeText}>{r.status==="under_review" ? "Under Review" : r.status.charAt(0).toUpperCase()+r.status.slice(1)}</Text></View>
            </View>
            {r.total!==null && r.total!==undefined ? <Text style={styles.eventNote}>Total {formatCurrency(r.total, currency)} (server)</Text> : null}
            {r.description ? <Text style={styles.eventNote} numberOfLines={2}>{r.description}</Text> : null}
            <Text style={styles.eventDate}>Submitted {formatDateTime(r.submittedAt, lang)}</Text>
          </View>
        ))}
        <Pressable onPress={()=> router.push("/(app)/profile/customer-requests" as any)} style={styles.linkBtn}><Text style={styles.linkText}>View all requests ({requests.length}) →</Text></Pressable>
      </View>

      <Text style={[styles.sectionTitle, rtl && { textAlign: "right" }]}>Activity</Text>
      <View style={styles.card}>
        <Empty title="Activity via Requests & Orders" message="Customer activity is tracked via request/order history and sales. Direct Customer activity endpoint is not dedicated; request history remains source of truth." />
      </View>

      <View style={styles.card}>
        <Text style={styles.actionTitle}>Export</Text>
        <Text style={styles.actionHint}>Generate a safe Customer summary PDF (own information only).</Text>
        <View style={{ marginTop: 12 }}>
          <Button title={pdfLoading ? "Generating..." : "Export Customer PDF"} onPress={handlePdf} loading={pdfLoading} />
          <Text style={styles.pdfHint}>Web: print preview • Native: share sheet • Sensitive fields excluded</Text>
          {Platform.OS==="web" ? <Text style={styles.pdfHint}>On web, allow popups for print.</Text> : null}
        </View>
      </View>

      <View style={{height:24}} />
    </ScrollView>
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
  orderRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  eventType: { fontWeight: "700", color: "#0F172A", fontSize: 13, textTransform: "capitalize" },
  eventNote: { color: "#475569", fontSize: 12, marginTop: 2 },
  eventDate: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionCard: { width: "100%", backgroundColor: "#fff", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#0F766E" },
  actionTitle: { fontWeight: "700", color: "#0F766E" },
  actionHint: { color: "#64748B", fontSize: 11, marginTop: 4 },
  linkBtn: { marginTop: 10, alignItems: "center" },
  linkText: { color: "#0F766E", fontWeight: "600", fontSize: 13 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeReview: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FDE68A" },
  badgeAccepted: { backgroundColor: "#DCFCE7", borderWidth: 1, borderColor: "#86EFAC" },
  badgeRejected: { backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#FCA5A5" },
  badgeCancelled: { backgroundColor: "#E2E8F0", borderWidth: 1, borderColor: "#CBD5E1" },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#334155" },
  pdfHint: { marginTop: 8, color: "#94A3B8", fontSize: 11, textAlign: "center" },
});
