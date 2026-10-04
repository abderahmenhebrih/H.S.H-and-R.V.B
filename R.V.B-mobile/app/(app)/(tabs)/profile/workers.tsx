import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable, Alert, TextInput, ScrollView } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { SearchField } from "@/components/common/SearchField";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/common/Button";
import { AppModal } from "@/components/common/Modal";
import { useTheme } from "@/theme/useTheme";
import { getWorkers, createWorker, updateWorker, archiveWorker, reactivateWorker, bonusAbsence, getWorkerFinancialEvents, getWorkerActivitiesForWorker, getWorkerRequestsForWorker } from "@/services/management.service";
import { formatCurrency } from "@/utils/currency";
import { formatDateTime } from "@/utils/date";
import { isRTL } from "@/i18n";

export default function WorkersManagement() {
  const { theme } = useTheme();
  const rtl = isRTL();
  const [workers, setWorkers] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", position: "butcher", startingSalary: "1000", monthlySalary: "20000", employmentDate: String(Date.now()) });
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ phone: "", position: "", monthlySalary: "" });
  const [bonusForm, setBonusForm] = useState({ amount: "", note: "" });
  const [history, setHistory] = useState<{ events: any[]; activities: any[]; requests: any[] }>({ events: [], activities: [], requests: [] });
  const [historyTab, setHistoryTab] = useState<"events" | "activities" | "requests">("events");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getWorkers();
      setWorkers(data);
      setFiltered(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load workers");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!search.trim()) setFiltered(workers);
    else {
      const s = search.toLowerCase();
      setFiltered(workers.filter((w) => w.name?.toLowerCase().includes(s) || w.phone?.includes(s) || w.position?.toLowerCase().includes(s)));
    }
  }, [search, workers]);

  const openDetail = async (w: any) => {
    setSelected(w);
    setDetail(w);
    setEditForm({ phone: w.phone || "", position: w.position || "", monthlySalary: String(w.monthlySalary || "") });
    try {
      const [events, activities, requests] = await Promise.all([getWorkerFinancialEvents(w.id).catch(() => []), getWorkerActivitiesForWorker(w.id).catch(() => []), getWorkerRequestsForWorker(w.id).catch(() => [])]);
      setHistory({ events, activities, requests });
    } catch {}
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.position.trim()) {
      Alert.alert("Invalid", "Name, phone and position required");
      return;
    }
    setSubmitting(true);
    try {
      await createWorker({
        name: form.name.trim(),
        phone: form.phone.trim(),
        position: form.position.trim(),
        startingSalary: Number(form.startingSalary) || 0,
        monthlySalary: Number(form.monthlySalary) || 0,
        employmentDate: Number(form.employmentDate) || Date.now(),
      });
      setShowCreate(false);
      setForm({ name: "", phone: "", position: "butcher", startingSalary: "1000", monthlySalary: "20000", employmentDate: String(Date.now()) });
      load();
      Alert.alert("Success", "Worker created");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!detail) return;
    try {
      await updateWorker(detail.id, { phone: editForm.phone.trim() || undefined, position: editForm.position.trim() || undefined, monthlySalary: editForm.monthlySalary ? Number(editForm.monthlySalary) : undefined });
      Alert.alert("Success", "Worker updated");
      load();
      const updated = await getWorkers().then((ws) => ws.find((x: any) => x.id === detail.id));
      if (updated) setDetail(updated);
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Edit failed");
    }
  };

  const handleBonus = async (type: "bonus" | "absence") => {
    if (!detail) return;
    const amt = Number(bonusForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert("Invalid", "Amount must be >0");
      return;
    }
    try {
      await bonusAbsence(detail.id, { type, amount: amt, note: bonusForm.note.trim() || undefined });
      Alert.alert("Success", `${type} recorded`);
      setBonusForm({ amount: "", note: "" });
      const [events] = await Promise.all([getWorkerFinancialEvents(detail.id).catch(() => [])]);
      setHistory((h) => ({ ...h, events }));
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || `${type} failed`);
    }
  };

  const handleArchive = async (w: any) => {
    Alert.alert("Archive Worker", `Archive ${w.name}? Balance must be 0 (currently ${w.balance}).`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        style: "destructive",
        onPress: async () => {
          try {
            await archiveWorker(w.id);
            Alert.alert("Archived", "Worker archived");
            load();
            setSelected(null);
          } catch (e: any) {
            Alert.alert("Failed", e?.message || "Archive failed");
          }
        },
      },
    ]);
  };

  if (loading) return <Loading message="Loading workers..." />;
  if (error && workers.length === 0) return <ErrorState title="Could not load workers" message={error} onRetry={load} />;

  return (
    <Screen padded={false}>
      <View style={{ padding: 16, backgroundColor: theme.colors.background }}>
        <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Workers</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{workers.length} workers • balance, salary, requests</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search name or phone" />
          </View>
          <Button title="+ New" onPress={() => setShowCreate(true)} testID="worker-create-open" />
        </View>
        {error ? (
          <View style={{ marginTop: 8 }}>
            <ErrorState title="Error" message={error} onRetry={load} />
          </View>
        ) : null}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Empty title="No workers" message={search ? "No matching workers" : "No workers yet"} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => openDetail(item)} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.name, { color: theme.colors.text }]}>{item.name}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{item.position} • {item.phone}</Text>
            <Text style={[styles.balance, { color: theme.colors.primary }]}>{formatCurrency(item.balance, "DA")} • Salary {formatCurrency(item.monthlySalary, "DA")}</Text>
          </Pressable>
        )}
      />
      {/* Create */}
      <AppModal visible={showCreate} onClose={() => setShowCreate(false)} title="New Worker">
        <View style={{ gap: 12 }}>
          <TextInput placeholder="Name *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} testID="worker-name-input" />
          <TextInput placeholder="Phone *" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} testID="worker-phone-input" />
          <TextInput placeholder="Position *" value={form.position} onChangeText={(v) => setForm({ ...form, position: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} />
          <TextInput placeholder="Starting Salary" value={form.startingSalary} onChangeText={(v) => setForm({ ...form, startingSalary: v })} keyboardType="numeric" style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} />
          <TextInput placeholder="Monthly Salary" value={form.monthlySalary} onChangeText={(v) => setForm({ ...form, monthlySalary: v })} keyboardType="numeric" style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} />
          <Button title={submitting ? "Creating..." : "Create Worker"} onPress={handleCreate} loading={submitting} testID="worker-create-submit" />
          <Button title="Cancel" variant="secondary" onPress={() => setShowCreate(false)} />
        </View>
      </AppModal>
      {/* Detail */}
      <AppModal visible={!!selected} onClose={() => setSelected(null)} title={detail ? detail.name : "Worker Detail"}>
        {detail ? (
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <Text style={[styles.name, { color: theme.colors.text }]}>{detail.name}</Text>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{detail.position} • {detail.phone}</Text>
            <Text style={[styles.balance, { color: theme.colors.primary }]}>{formatCurrency(detail.balance, "DA")} balance • {formatCurrency(detail.monthlySalary, "DA")} monthly</Text>
            <StatusBadge status={detail.status} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <Button title="Edit" onPress={() => {}} testID="worker-detail-edit" />
              <Button title={detail.status === "active" ? "Archive" : "Reactivate"} variant="secondary" onPress={() => (detail.status === "active" ? handleArchive(detail) : reactivateWorker(detail.id).then(load).catch((e) => Alert.alert("Failed", e.message)))} />
            </View>
            {/* Edit Form */}
            <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceHover }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Edit Worker</Text>
              <TextInput placeholder="Phone" value={editForm.phone} onChangeText={(v) => setEditForm({ ...editForm, phone: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} testID="worker-edit-phone" />
              <TextInput placeholder="Position" value={editForm.position} onChangeText={(v) => setEditForm({ ...editForm, position: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, marginTop: 8 }]} placeholderTextColor={theme.colors.textTertiary} />
              <TextInput placeholder="Monthly Salary" value={editForm.monthlySalary} onChangeText={(v) => setEditForm({ ...editForm, monthlySalary: v })} keyboardType="numeric" style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, marginTop: 8 }]} placeholderTextColor={theme.colors.textTertiary} />
              <View style={{ marginTop: 8 }}>
                <Button title="Save Edit" onPress={handleEdit} testID="worker-edit-save" />
              </View>
            </View>
            {/* Bonus/Absence */}
            <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceHover }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Bonus / Absence</Text>
              <TextInput placeholder="Amount" value={bonusForm.amount} onChangeText={(v) => setBonusForm({ ...bonusForm, amount: v })} keyboardType="numeric" style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} testID="worker-bonus-amount" />
              <TextInput placeholder="Note (optional)" value={bonusForm.note} onChangeText={(v) => setBonusForm({ ...bonusForm, note: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, marginTop: 8 }]} placeholderTextColor={theme.colors.textTertiary} />
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Button title="Add Bonus" onPress={() => handleBonus("bonus")} testID="worker-bonus-submit" />
                <Button title="Absence" variant="secondary" onPress={() => handleBonus("absence")} testID="worker-absence-submit" />
              </View>
            </View>
            {/* History Tabs */}
            <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
              {(["events", "activities", "requests"] as const).map((t) => (
                <Pressable key={t} onPress={() => setHistoryTab(t)} style={[styles.chip, { borderColor: historyTab === t ? theme.colors.primary : theme.colors.border, backgroundColor: historyTab === t ? theme.colors.primarySoft : theme.colors.surface }]}>
                  <Text style={[styles.chipText, { color: historyTab === t ? theme.colors.primary : theme.colors.textSecondary }]}>{t}</Text>
                </Pressable>
              ))}
            </View>
            {historyTab === "events" ? (
              <View>
                {history.events.length === 0 ? <Text style={{ color: theme.colors.textTertiary, fontSize: 12, marginTop: 8 }}>No financial events</Text> : history.events.slice(0, 10).map((e: any) => <Text key={e.id} style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 }}>{e.type} {formatCurrency(e.amount, "DA")} • {e.note || ""} • {formatDateTime(e.createdAt, "en")}</Text>)}
              </View>
            ) : historyTab === "activities" ? (
              <View>
                {history.activities.length === 0 ? <Text style={{ color: theme.colors.textTertiary, fontSize: 12, marginTop: 8 }}>No activities</Text> : history.activities.slice(0, 10).map((a: any) => <Text key={a.id} style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 }}>{a.action} • {a.details || ""}</Text>)}
              </View>
            ) : (
              <View>
                {history.requests.length === 0 ? <Text style={{ color: theme.colors.textTertiary, fontSize: 12, marginTop: 8 }}>No requests</Text> : history.requests.slice(0, 10).map((r: any) => <Text key={r.id} style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 }}>{r.type} {r.amount ? formatCurrency(r.amount, "DA") : ""} • {r.status}</Text>)}
              </View>
            )}
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
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  section: { borderRadius: 10, padding: 10, borderWidth: 1, marginTop: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
});
