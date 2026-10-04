import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Alert, TextInput } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { Button } from "@/components/common/Button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useTheme } from "@/theme/useTheme";
import { getOrders, editOrder, cancelOrder, getCatalogForCustomer, getConfig } from "@/services/customer.service";
import type { CustomerOrder, CatalogProduct } from "@/types/customer";
import { formatCurrency } from "@/utils/currency";
import { formatDateTime, getCurrentLanguage } from "@/utils/date";
import { isRTL } from "@/i18n";

type EditItem = { productId: string; quantity: string; weightKg: string };

function roundMoney(v: number) {
  return Math.round(v * 100) / 100;
}

export default function CustomerOrdersScreen() {
  const { theme } = useTheme();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [currency, setCurrency] = useState("DA");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [showPickerFor, setShowPickerFor] = useState<number | null>(null);
  const lang = getCurrentLanguage();
  const rtl = isRTL();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [oRes, cRes, catRes] = await Promise.all([
        getOrders(),
        getConfig().catch(() => ({ currency: "DA" } as any)),
        getCatalogForCustomer().catch(() => ({ products: [] as any })),
      ]);
      setOrders(oRes.orders);
      setCurrency(cRes.currency || "DA");
      setProducts(catRes.products || []);
    } catch (e: any) {
      if (e?.code === "NETWORK_ERROR") setError("Connection problem. Pull to retry.");
      else setError(e?.message || "Failed to load orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const handleCancel = async (order: CustomerOrder) => {
    if (order.status !== "under_review") {
      Alert.alert("Cannot cancel", "Only Under Review orders can be cancelled");
      return;
    }
    setCancelConfirmId(order.id);
  };
  const confirmCancel = async () => {
    if (!cancelConfirmId) return;
    try {
      await cancelOrder(cancelConfirmId);
      setCancelConfirmId(null);
      Alert.alert("Cancelled", "Order cancelled");
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Cancel failed");
    }
  };

  const startEdit = (order: CustomerOrder) => {
    if (order.status !== "under_review") {
      Alert.alert("Cannot edit", "Only Under Review orders can be edited");
      return;
    }
    setEditingId(order.id);
    setEditNotes(order.notes || "");
    setEditItems(
      order.items.map((it) => ({
        productId: it.productId,
        quantity: String(it.quantity),
        weightKg: String(it.weightKg),
      }))
    );
    setShowPickerFor(null);
  };

  const updateEditItem = (idx: number, field: keyof EditItem, value: string) => {
    setEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const addEditItem = () => {
    if (editItems.length >= 50) {
      Alert.alert("Limit", "Max 50 items");
      return;
    }
    setEditItems((prev) => [...prev, { productId: "", quantity: "1", weightKg: "0" }]);
  };
  const removeEditItem = (idx: number) => {
    if (editItems.length <= 1) {
      Alert.alert("Required", "At least one item required");
      return;
    }
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const validateEdit = (): string | null => {
    if (editItems.length === 0) return "At least one item required";
    if (editItems.length > 50) return "Too many items (max 50)";
    for (let i = 0; i < editItems.length; i++) {
      const it = editItems[i];
      if (!it.productId) return `Item ${i + 1}: product required`;
      const q = Number(it.quantity);
      if (!Number.isFinite(q) || q <= 0) return `Item ${i + 1}: quantity must be >0`;
      const w = Number(it.weightKg);
      if (!Number.isFinite(w) || w < 0) return `Item ${i + 1}: weight must be >=0`;
      if (!products.find((p) => p.id === it.productId)) return `Item ${i + 1}: product not found`;
    }
    if (editNotes.length > 2000) return "Notes must be ≤2000 characters";
    return null;
  };

  const submitEdit = async (order: CustomerOrder) => {
    const v = validateEdit();
    if (v) {
      Alert.alert("Invalid", v);
      return;
    }
    try {
      const payloadItems = editItems.map((it) => {
        const prod = products.find((p) => p.id === it.productId);
        return {
          productId: it.productId,
          quantity: Number(it.quantity),
          weightKg: Number(it.weightKg),
          price: prod ? prod.price : 0,
        };
      });
      await editOrder(order.id, { items: payloadItems, notes: editNotes.trim() || undefined });
      Alert.alert("Success", "Order updated. Status remains Under Review.");
      setEditingId(null);
      load();
    } catch (e: any) {
      Alert.alert("Edit failed", e?.message || "Failed to edit");
    }
  };

  if (loading) return <Loading message="Loading orders..." />;
  if (error && orders.length === 0) return <ErrorState title="Could not load orders" message={error} onRetry={load} />;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={[styles.content, { backgroundColor: theme.colors.background }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>My Orders</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>
          Under Review → Accepted | Rejected | Cancelled. Edit and Cancel only while Under Review.
        </Text>
        {error ? (
          <View style={{ marginTop: 8 }}>
            <ErrorState title="Connection problem" message={error} onRetry={load} />
          </View>
        ) : null}
        {orders.length === 0 ? (
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Empty title="No orders yet" message="Your placed orders will appear here. Place an order via Place Order." />
          </View>
        ) : (
          orders.map((o) => (
            <View key={o.id} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[styles.type, { color: theme.colors.text }]}>Order {o.id.slice(0, 8)}</Text>
                <StatusBadge status={o.status} />
              </View>
              <Text style={[styles.amount, { color: theme.colors.primary }]}>
                Total {formatCurrency(o.total, currency)} • {o.items.length} items
              </Text>
              {o.items.slice(0, 3).map((it, idx) => (
                <Text key={idx} style={[styles.desc, { color: theme.colors.textSecondary }]}>
                  {it.productId.slice(0, 8)} x{it.quantity} {it.weightKg}kg @ {formatCurrency(it.price, currency)} = {formatCurrency(it.total, currency)}
                </Text>
              ))}
              {o.items.length > 3 ? <Text style={[styles.desc, { color: theme.colors.textTertiary }]}>+ {o.items.length - 3} more items</Text> : null}
              {o.notes ? <Text style={[styles.desc, { color: theme.colors.textSecondary }]}>Notes: {o.notes}</Text> : null}
              <Text style={[styles.date, { color: theme.colors.textTertiary }]}>
                Submitted {formatDateTime(o.submittedAt, lang)}
                {o.reviewedAt ? ` • Reviewed ${formatDateTime(o.reviewedAt, lang)}` : ""}
                {o.cancelledAt ? ` • Cancelled ${formatDateTime(o.cancelledAt, lang)}` : ""}
              </Text>

              {editingId === o.id ? (
                <View style={[styles.editBox, { backgroundColor: theme.colors.surfaceHover, borderColor: theme.colors.border }]}>
                  <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Edit Order — All Items (1..50) • Price authoritative</Text>

                  {editItems.map((it, idx) => {
                    const prod = products.find((p) => p.id === it.productId);
                    const serverPrice = prod ? prod.price : 0;
                    const w = Number(it.weightKg) || 0;
                    const est = roundMoney(w * serverPrice);
                    const prodName = prod?.name || "Select product";
                    return (
                      <View key={idx} style={[styles.itemCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                        <View style={styles.itemHeader}>
                          <Text style={[styles.itemTitle, { color: theme.colors.text }]}>Item {idx + 1}</Text>
                          {editItems.length > 1 ? (
                            <Pressable testID={`customer-order-remove-item-${idx}`} accessibilityRole="button" onPress={() => removeEditItem(idx)}>
                              <Text style={[styles.remove, { color: theme.colors.error }]}>Remove</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <Pressable
                          testID={`customer-order-edit-product-selector-${idx}`}
                          accessibilityRole="button"
                          style={[styles.picker, { backgroundColor: theme.colors.surfaceHover, borderColor: theme.colors.border }]}
                          onPress={() => setShowPickerFor(showPickerFor === idx ? null : idx)}
                        >
                          <Text style={[styles.pickerText, { color: theme.colors.text }]}>{prodName}</Text>
                          <Text style={[styles.pickerHint, { color: theme.colors.textTertiary }]}>
                            {prod ? `${formatCurrency(prod.price, currency)} ${prod.available ? "• available" : ""}` : "Tap to choose"}
                          </Text>
                        </Pressable>
                        {showPickerFor === idx ? (
                          <View style={[styles.pickerList, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                            <ScrollView style={{ maxHeight: 150 }}>
                              {products.map((pr) => (
                                <Pressable
                                  key={pr.id}
                                  testID={`customer-order-edit-product-option-${pr.id}`}
                                  accessibilityRole="button"
                                  style={[styles.productRow, { borderBottomColor: theme.colors.border }]}
                                  onPress={() => {
                                    updateEditItem(idx, "productId", pr.id);
                                    setShowPickerFor(null);
                                  }}
                                >
                                  <Text style={[styles.productName, { color: theme.colors.text }]}>{pr.name}</Text>
                                  <Text style={[styles.productPrice, { color: theme.colors.textSecondary }]}>{formatCurrency(pr.price, currency)}</Text>
                                </Pressable>
                              ))}
                            </ScrollView>
                          </View>
                        ) : null}
                        <View style={styles.row}>
                          <View style={styles.field}>
                            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Quantity *</Text>
                            <TextInput
                              testID={`customer-order-edit-quantity-${idx}`}
                              accessibilityLabel="quantity"
                              style={[styles.input, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text }]}
                              value={it.quantity}
                              onChangeText={(v) => updateEditItem(idx, "quantity", v)}
                              keyboardType="numeric"
                              placeholder="1"
                              placeholderTextColor={theme.colors.textTertiary}
                            />
                          </View>
                          <View style={styles.field}>
                            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>WeightKg</Text>
                            <TextInput
                              testID={`customer-order-edit-weight-${idx}`}
                              accessibilityLabel="weight"
                              style={[styles.input, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text }]}
                              value={it.weightKg}
                              onChangeText={(v) => updateEditItem(idx, "weightKg", v)}
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor={theme.colors.textTertiary}
                            />
                          </View>
                        </View>
                        <View style={styles.row}>
                          <View style={styles.field}>
                            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Server Price</Text>
                            <View style={[styles.totalBox, { backgroundColor: theme.colors.surfaceHover, borderColor: theme.colors.border }]}>
                              <Text style={[styles.totalText, { color: theme.colors.primary }]}>{formatCurrency(serverPrice, currency)}</Text>
                            </View>
                            <Text style={[styles.calcHint, { color: theme.colors.textTertiary }]}>authoritative</Text>
                          </View>
                          <View style={styles.field}>
                            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Est. Total</Text>
                            <View style={[styles.totalBox, { backgroundColor: theme.colors.surfaceHover, borderColor: theme.colors.border }]}>
                              <Text style={[styles.totalText, { color: theme.colors.primary }]}>{formatCurrency(est, currency)}</Text>
                            </View>
                            <Text style={[styles.calcHint, { color: theme.colors.textTertiary }]}>weight × price</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  <Pressable testID="customer-order-add-item" accessibilityRole="button" onPress={addEditItem} style={[styles.addBtn, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.addText, { color: theme.colors.primary }]}>+ Add Product</Text>
                  </Pressable>
                  <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>Max 50 items. Price will be overridden to server authoritative.</Text>

                  <Text style={[styles.label, { color: theme.colors.textSecondary, marginTop: 12 }]}>Notes</Text>
                  <TextInput
                    testID="customer-order-edit-notes"
                    accessibilityLabel="notes"
                    style={[styles.input, { minHeight: 50, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, textAlignVertical: "top" }]}
                    value={editNotes}
                    onChangeText={setEditNotes}
                    placeholder="Notes"
                    multiline
                    maxLength={2001}
                    placeholderTextColor={theme.colors.textTertiary}
                  />
                  <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{editNotes.length} / 2000</Text>

                  <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    <Button testID="customer-order-save" accessibilityRole="button" title="Save Changes" onPress={() => submitEdit(o)} />
                    <Button testID="customer-order-cancel-edit" title="Cancel" onPress={() => setEditingId(null)} variant="secondary" />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {o.status === "under_review" ? (
                    <>
                      <Pressable testID={`customer-order-edit-${o.id}`} accessibilityRole="button" onPress={() => startEdit(o)} style={[styles.actionBtn, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primaryRing }]}>
                        <Text style={[styles.actionBtnText, { color: theme.colors.primary }]}>Edit</Text>
                      </Pressable>
                      <Pressable testID={`customer-order-cancel-${o.id}`} accessibilityRole="button" onPress={() => handleCancel(o)} style={[styles.actionBtn, { backgroundColor: theme.colors.errorSoft, borderColor: theme.colors.error }]}>
                        <Text style={[styles.actionBtnText, { color: theme.colors.error }]}>Cancel</Text>
                      </Pressable>
                      {/* generic aliases for stable selector */}
                      <Pressable testID="customer-order-edit" accessibilityRole="button" onPress={() => startEdit(o)} style={[styles.actionBtn, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primaryRing, display: "none" }]}>
                        <Text style={[styles.actionBtnText, { color: theme.colors.primary }]}>Edit</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>Cannot edit/cancel terminal order ({o.status})</Text>
                  )}
                </View>
              )}
            </View>
          ))
        )}
        {cancelConfirmId ? (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 16 }}>
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: theme.colors.border, width: "90%" }}>
              <Text style={{ color: theme.colors.text, fontWeight: "700", textAlign: "center" }}>Cancel order {cancelConfirmId.slice(0, 8)}?</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Pressable testID="customer-order-confirm-cancel" accessibilityRole="button" onPress={confirmCancel} style={{ flex: 1, backgroundColor: theme.colors.error, padding: 12, borderRadius: 8, alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Yes</Text>
                </Pressable>
                <Pressable testID="customer-order-cancel-dismiss" accessibilityRole="button" onPress={() => setCancelConfirmId(null)} style={{ flex: 1, backgroundColor: theme.colors.surfaceHover, padding: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: theme.colors.border }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "700" }}>No</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { marginTop: 4, fontSize: 12, lineHeight: 16 },
  card: { marginTop: 12, borderRadius: 12, padding: 12, borderWidth: 1 },
  type: { fontWeight: "700" },
  amount: { marginTop: 4, fontWeight: "600", fontSize: 12 },
  desc: { marginTop: 4, fontSize: 12, lineHeight: 16 },
  date: { marginTop: 4, fontSize: 11 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  actionBtnText: { fontWeight: "700", fontSize: 12 },
  editBox: { marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: "700", marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13 },
  hint: { marginTop: 4, fontSize: 11, textAlign: "center" },
  itemCard: { marginTop: 10, borderRadius: 10, padding: 10, borderWidth: 1 },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  itemTitle: { fontWeight: "700", fontSize: 13 },
  remove: { fontWeight: "600", fontSize: 12 },
  picker: { borderWidth: 1, borderRadius: 8, padding: 10 },
  pickerText: { fontWeight: "600", fontSize: 13 },
  pickerHint: { fontSize: 11, marginTop: 2 },
  pickerList: { marginTop: 8, borderWidth: 1, borderRadius: 8, maxHeight: 150 },
  productRow: { padding: 10, borderBottomWidth: 1 },
  productName: { fontWeight: "600", fontSize: 13 },
  productPrice: { fontSize: 11, marginTop: 2 },
  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  field: { flex: 1 },
  totalBox: { borderWidth: 1, borderRadius: 8, padding: 10, alignItems: "center" },
  totalText: { fontWeight: "800", fontSize: 13 },
  calcHint: { fontSize: 10, marginTop: 2, textAlign: "center" },
  addBtn: { marginTop: 10, alignItems: "center", padding: 10, borderWidth: 1, borderRadius: 8 },
  addText: { fontWeight: "600", fontSize: 13 },
});
