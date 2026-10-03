import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable, Alert, TextInput, ScrollView } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { SearchField } from "@/components/common/SearchField";
import { Button } from "@/components/common/Button";
import { AppModal } from "@/components/common/Modal";
import { useTheme } from "@/theme/useTheme";
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomerSales, getCustomerPaymentsForCustomer } from "@/services/management.service";
import { getRequests, getCustomerOrders } from "@/services/management.service";
import { formatCurrency } from "@/utils/currency";
import { formatDateTime } from "@/utils/date";
import { isRTL } from "@/i18n";

export default function CustomersManagement() {
  const { theme } = useTheme();
  const rtl = isRTL();
  const [customers, setCustomers] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", type: "Retail", address: "" });
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ phone: "", address: "" });
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getCustomers();
      setCustomers(data);
      setFiltered(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load customers");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!search.trim()) setFiltered(customers);
    else {
      const s = search.toLowerCase();
      setFiltered(customers.filter((c) => c.name?.toLowerCase().includes(s) || c.phone?.includes(s) || c.type?.toLowerCase().includes(s)));
    }
  }, [search, customers]);

  const openDetail = async (c: any) => {
    setSelected(c);
    setDetail(c);
    setEditForm({ phone: c.phone || "", address: c.address || "" });
    try {
      const [s, p, reqRes, ordRes] = await Promise.all([
        getCustomerSales(c.id).catch(() => []),
        getCustomerPaymentsForCustomer(c.id).catch(() => []),
        getRequests({ source: "customer", search: c.name }).then((r) => r.requests || []).catch(() => []),
        getCustomerOrders({ customerId: c.id }).catch(() => []),
      ]);
      setSales(s);
      setPayments(p);
      setRequests(reqRes);
      setOrders(ordRes);
    } catch {}
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.type.trim()) {
      Alert.alert("Invalid", "Name, phone and type required");
      return;
    }
    setSubmitting(true);
    try {
      await createCustomer({ name: form.name.trim(), phone: form.phone.trim(), type: form.type.trim(), address: form.address.trim() || undefined });
      setShowCreate(false);
      setForm({ name: "", phone: "", type: "Retail", address: "" });
      load();
      Alert.alert("Success", "Customer created");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Create failed");
    } finally {
      setSubmitting(false);
    }
  };
  const handleEdit = async () => {
    if (!detail) return;
    try {
      await updateCustomer(detail.id, { phone: editForm.phone.trim() || undefined, address: editForm.address.trim() || undefined });
      Alert.alert("Success", "Customer updated");
      load();
      const updated = await getCustomers().then((ws) => ws.find((x: any) => x.id === detail.id));
      if (updated) setDetail(updated);
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Edit failed");
    }
  };
  const handleDelete = async () => {
    if (!detail) return;
    Alert.alert("Delete Customer", `Delete ${detail.name}? Requires balance 0 and no sales/payments.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCustomer(detail.id);
            Alert.alert("Deleted", "Customer deleted");
            setSelected(null);
            load();
          } catch (e: any) {
            Alert.alert("Failed", e?.message || "Delete failed");
          }
        },
      },
    ]);
  };

  if (loading) return <Loading message="Loading customers..." />;
  if (error && customers.length === 0) return <ErrorState title="Could not load customers" message={error} onRetry={load} />;

  return (
    <Screen padded={false}>
      <View style={{ padding: 16, backgroundColor: theme.colors.background }}>
        <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Customers</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{customers.length} customers • sales & balance</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search name or phone" />
          </View>
          <Button title="+ New" onPress={() => setShowCreate(true)} testID="customer-create-open" />
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Empty title="No customers" message={search ? "No matching customers" : "No customers yet"} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => openDetail(item)} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
            <Text style={[styles.name, { color: theme.colors.text }]}>{item.name}</Text>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{item.phone} • {item.type}</Text>
            <Text style={[styles.balance, { color: theme.colors.primary }]}>{formatCurrency(item.balance, "DA")} balance</Text>
            <Text style={[styles.meta, { color: theme.colors.textTertiary }]}>RC {item.rc || "-"} • NIF {item.nif || "-"}</Text>
          </Pressable>
        )}
      />
      <AppModal visible={showCreate} onClose={() => setShowCreate(false)} title="New Customer">
        <View style={{ gap: 12 }}>
          <TextInput placeholder="Name *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} testID="customer-name-input" />
          <TextInput placeholder="Phone *" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} />
          <TextInput placeholder="Type * (Retail/Wholesale)" value={form.type} onChangeText={(v) => setForm({ ...form, type: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} />
          <TextInput placeholder="Address" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} />
          <Button title={submitting ? "Creating..." : "Create Customer"} onPress={handleCreate} loading={submitting} testID="customer-create-submit" />
          <Button title="Cancel" variant="secondary" onPress={() => setShowCreate(false)} />
        </View>
      </AppModal>
      <AppModal visible={!!selected} onClose={() => setSelected(null)} title={detail ? detail.name : "Customer Detail"}>
        {detail ? (
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <Text style={[styles.name, { color: theme.colors.text }]}>{detail.name}</Text>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{detail.phone} • {detail.type}</Text>
            <Text style={[styles.balance, { color: theme.colors.primary }]}>{formatCurrency(detail.balance, "DA")} balance</Text>
            <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceHover }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Edit Customer</Text>
              <TextInput placeholder="Phone" value={editForm.phone} onChangeText={(v) => setEditForm({ ...editForm, phone: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, marginTop: 8 }]} placeholderTextColor={theme.colors.textTertiary} testID="customer-edit-phone" />
              <TextInput placeholder="Address" value={editForm.address} onChangeText={(v) => setEditForm({ ...editForm, address: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, marginTop: 8 }]} placeholderTextColor={theme.colors.textTertiary} />
              <View style={{ marginTop: 8 }}>
                <Button title="Save Edit" onPress={handleEdit} testID="customer-edit-save" />
              </View>
              <View style={{ marginTop: 8 }}>
                <Button title="Delete Customer" variant="secondary" onPress={handleDelete} testID="customer-delete" />
              </View>
            </View>
            <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceHover }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Sales ({sales.length})</Text>
              {sales.length === 0 ? <Text style={{ color: theme.colors.textTertiary, fontSize: 12 }}>No sales</Text> : sales.slice(0, 5).map((s: any) => <Text key={s.id} style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 }}>{formatDateTime(s.date, "en")} • {formatCurrency(s.total, "DA")} • {s.items?.length || 0} items</Text>)}
            </View>
            <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceHover }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Payments ({payments.length})</Text>
              {payments.length === 0 ? <Text style={{ color: theme.colors.textTertiary, fontSize: 12 }}>No payments</Text> : payments.slice(0, 5).map((p: any) => <Text key={p.id} style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 }}>{formatCurrency(p.amount, "DA")} • {p.note || ""}</Text>)}
            </View>
            <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceHover }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Requests ({requests.length})</Text>
              {requests.length === 0 ? <Text style={{ color: theme.colors.textTertiary, fontSize: 12 }}>No requests</Text> : requests.slice(0, 5).map((r: any) => <Text key={r.id} style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 }}>{r.type} • {r.status} • {r.total ? formatCurrency(r.total, "DA") : ""}</Text>)}
            </View>
            <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceHover }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Orders ({orders.length})</Text>
              {orders.length === 0 ? <Text style={{ color: theme.colors.textTertiary, fontSize: 12 }}>No orders</Text> : orders.slice(0, 5).map((o: any) => <Text key={o.id} style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 }}>{o.id.slice(0, 8)} • {o.status} • {formatCurrency(o.total, "DA")}</Text>)}
            </View>
            <Button title="Close" variant="secondary" onPress={() => setSelected(null)} />
          </ScrollView>
        ) : null}
      </AppModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 4 },
  card: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 10 },
  name: { fontWeight: "700", fontSize: 15 },
  sub: { fontSize: 12, marginTop: 2 },
  balance: { fontWeight: "700", fontSize: 13, marginTop: 6 },
  meta: { fontSize: 11, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13 },
  section: { borderRadius: 10, padding: 10, borderWidth: 1, marginTop: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
});
