import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable, Alert, TextInput, ScrollView } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { SearchField } from "@/components/common/SearchField";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/common/Button";
import { AppModal, ConfirmModal } from "@/components/common/Modal";
import { useTheme } from "@/theme/useTheme";
import { getAccounts, createAccount, archiveAccount, reactivateAccount, getLinkable } from "@/services/management.service";
import { api } from "@/api/client";
import { isRTL } from "@/i18n";

export default function AccountsScreen() {
  const { theme } = useTheme();
  const rtl = isRTL();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState({ tag: "", displayName: "", role: "worker", password: "", confirmPassword: "", linkedEntityType: "", linkedEntityId: "" });
  const [linkables, setLinkables] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pwdForm, setPwdForm] = useState({ password: "", confirmPassword: "" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getAccounts();
      setAccounts(data);
      setFiltered(data);
    } catch (e: any) {
      if (e?.code === "RVB_FORBIDDEN") setError("Forbidden: Manager only");
      else setError(e?.message || "Failed to load accounts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!search.trim()) setFiltered(accounts);
    else {
      const s = search.toLowerCase();
      setFiltered(accounts.filter((a) => a.tag?.toLowerCase().includes(s) || a.displayName?.toLowerCase().includes(s) || a.role?.includes(s)));
    }
  }, [search, accounts]);

  // Supervisor links to a Worker (canonical supervisor → worker mapping).
  const linkEntityType = form.role === "supervisor" ? "worker" : form.role;
  useEffect(() => {
    if (form.role === "worker" || form.role === "supplier" || form.role === "customer" || form.role === "supervisor") {
      getLinkable(linkEntityType as any).then(setLinkables).catch(() => setLinkables([]));
    } else setLinkables([]);
  }, [form.role, linkEntityType]);

  const handleCreate = async () => {
    if (!form.tag.trim() || !form.displayName.trim() || !form.role.trim() || !form.password.trim()) {
      Alert.alert("Invalid", "Tag, displayName, role, password required");
      return;
    }
    if (form.password !== form.confirmPassword) {
      Alert.alert("Invalid", "Passwords do not match");
      return;
    }
    const needsLink = form.role === "worker" || form.role === "supplier" || form.role === "customer" || form.role === "supervisor";
    if (needsLink && !form.linkedEntityId) {
      Alert.alert("Invalid", "Linked worker is required for this role");
      return;
    }
    setSubmitting(true);
    try {
      await createAccount({
        tag: form.tag.trim(),
        displayName: form.displayName.trim(),
        role: form.role as any,
        password: form.password,
        confirmPassword: form.confirmPassword,
        ...(form.linkedEntityId ? { linkedEntityType: linkEntityType, linkedEntityId: form.linkedEntityId } : {}),
      });
      setShowCreate(false);
      setForm({ tag: "", displayName: "", role: "worker", password: "", confirmPassword: "", linkedEntityType: "", linkedEntityId: "" });
      load();
      Alert.alert("Success", "Account created");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (acc: any) => {
    Alert.alert("Archive Account", `Archive @${acc.tag}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        style: "destructive",
        onPress: async () => {
          try {
            await archiveAccount(acc.id);
            Alert.alert("Archived", "Account archived");
            load();
          } catch (e: any) {
            Alert.alert("Failed", e?.message || "Archive failed");
          }
        },
      },
    ]);
  };
  const handleReactivate = async (acc: any) => {
    try {
      await reactivateAccount(acc.id);
      Alert.alert("Reactivated", "Account reactivated");
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Reactivate failed");
    }
  };
  const handleSetPassword = async () => {
    if (!selected) return;
    if (!pwdForm.password || pwdForm.password !== pwdForm.confirmPassword) {
      Alert.alert("Invalid", "Passwords do not match");
      return;
    }
    try {
      await api.post(`/api/rvb/accounts/${selected.id}/set-initial-password`, { password: pwdForm.password, confirmPassword: pwdForm.confirmPassword });
      Alert.alert("Success", "Password set");
      setShowPassword(false);
      setPwdForm({ password: "", confirmPassword: "" });
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Set password failed");
    }
  };

  if (loading) return <Loading message="Loading accounts..." />;
  if (error && accounts.length === 0) return <ErrorState title="Could not load accounts" message={error} onRetry={load} />;

  return (
    <Screen padded={false}>
      <View style={[styles.header, { backgroundColor: theme.colors.background, padding: 16 }]}>
        <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Accounts & Access</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{accounts.length} accounts • @tag immutable</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search by @tag, name or role" />
          </View>
          <Button title="+ New" onPress={() => setShowCreate(true)} />
        </View>
      </View>
      {error ? (
        <View style={{ margin: 16 }}>
          <ErrorState title="Error" message={error} onRetry={load} />
        </View>
      ) : null}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Empty title="No accounts" message={search ? "No matching accounts" : "No accounts found"} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.name, { color: theme.colors.text }]}>{item.displayName}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={[styles.tag, { color: theme.colors.primary }]}>@{item.tag}</Text>
            <Text style={[styles.role, { color: theme.colors.textSecondary }]}>{item.role} • onboarding {item.onboardingStatus}</Text>
            {item.linkedEntityType ? (
              <Text style={[styles.linked, { color: theme.colors.textSecondary }]}>Linked: {item.linkedEntityType} {item.linkedEntityDisplayName || item.linkedEntityId?.slice(0, 8) || "-"}</Text>
            ) : (
              <Text style={[styles.linked, { color: theme.colors.textTertiary }]}>No linked entity</Text>
            )}
            <Text style={[styles.meta, { color: theme.colors.textTertiary }]}>Must change password: {item.mustChangePassword ? "Yes" : "No"}</Text>
          </Pressable>
        )}
      />
      {/* Create Modal */}
      <AppModal visible={showCreate} onClose={() => setShowCreate(false)} title="New Account">
        <ScrollView contentContainerStyle={{ gap: 12 }}>
          <TextInput placeholder="@tag (immutable, e.g. qa.tmp.mobile)" value={form.tag} onChangeText={(v) => setForm({ ...form, tag: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} autoCapitalize="none" testID="account-create-tag" />
          <TextInput placeholder="Display Name" value={form.displayName} onChangeText={(v) => setForm({ ...form, displayName: v })} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} testID="account-create-displayName" />
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {(["worker", "supplier", "customer", "supervisor", "manager"] as const).map((r) => (
              <Pressable key={r} onPress={() => setForm({ ...form, role: r })} style={[styles.chip, { borderColor: form.role === r ? theme.colors.primary : theme.colors.border, backgroundColor: form.role === r ? theme.colors.primarySoft : theme.colors.surface }]}>
                <Text style={[styles.chipText, { color: form.role === r ? theme.colors.primary : theme.colors.textSecondary }]}>{r}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput placeholder="Password" value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} testID="account-create-password" />
          <TextInput placeholder="Confirm Password" value={form.confirmPassword} onChangeText={(v) => setForm({ ...form, confirmPassword: v })} secureTextEntry style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} testID="account-create-confirm" />
          {(form.role === "worker" || form.role === "supplier" || form.role === "customer" || form.role === "supervisor") && linkables.length > 0 ? (
            <View>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Linkable {linkEntityType} (required)</Text>
              <ScrollView style={{ maxHeight: 120, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, marginTop: 6 }}>
                {linkables.map((e) => (
                  <Pressable key={e.id} onPress={() => setForm({ ...form, linkedEntityId: e.id })} style={[styles.linkableRow, { backgroundColor: form.linkedEntityId === e.id ? theme.colors.primarySoft : theme.colors.surface }]}>
                    <Text style={[styles.linkableText, { color: theme.colors.text }]}>{e.name} • {e.phone}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <Button title={submitting ? "Creating..." : "Create Account"} onPress={handleCreate} loading={submitting} testID="account-create-submit" />
          <Button title="Cancel" variant="secondary" onPress={() => setShowCreate(false)} />
        </ScrollView>
      </AppModal>
      {/* Detail Modal */}
      <AppModal visible={!!selected} onClose={() => setSelected(null)} title={selected ? `@${selected.tag}` : "Account"}>
        {selected ? (
          <View style={{ gap: 12 }}>
            <Text style={[styles.name, { color: theme.colors.text }]}>{selected.displayName}</Text>
            <Text style={[styles.tag, { color: theme.colors.primary }]}>@{selected.tag} (immutable)</Text>
            <Text style={[styles.role, { color: theme.colors.textSecondary }]}>Role: {selected.role}</Text>
            <Text style={[styles.linked, { color: theme.colors.textSecondary }]}>Status: {selected.status}</Text>
            <Text style={[styles.linked, { color: theme.colors.textSecondary }]}>Onboarding: {selected.onboardingStatus}</Text>
            <Text style={[styles.linked, { color: theme.colors.textSecondary }]}>Must change password: {selected.mustChangePassword ? "Yes" : "No"}</Text>
            {selected.linkedEntityType ? <Text style={[styles.linked, { color: theme.colors.textSecondary }]}>Linked: {selected.linkedEntityType} {selected.linkedEntityDisplayName || selected.linkedEntityId}</Text> : null}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {selected.status === "active" ? <Button title="Archive" variant="secondary" onPress={() => { setSelected(null); handleArchive(selected); }} /> : <Button title="Reactivate" onPress={() => { setSelected(null); handleReactivate(selected); }} />}
              <Button title="Set Password" onPress={() => setShowPassword(true)} />
            </View>
            <Button title="Close" variant="secondary" onPress={() => setSelected(null)} />
          </View>
        ) : null}
      </AppModal>
      <AppModal visible={showPassword} onClose={() => setShowPassword(false)} title="Set Initial Password">
        <View style={{ gap: 12 }}>
          <TextInput placeholder="New Password" value={pwdForm.password} onChangeText={(v) => setPwdForm({ ...pwdForm, password: v })} secureTextEntry style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} testID="account-set-password" />
          <TextInput placeholder="Confirm Password" value={pwdForm.confirmPassword} onChangeText={(v) => setPwdForm({ ...pwdForm, confirmPassword: v })} secureTextEntry style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholderTextColor={theme.colors.textTertiary} testID="account-set-confirm" />
          <Button title="Set Password" onPress={handleSetPassword} testID="account-set-submit" />
          <Button title="Cancel" variant="secondary" onPress={() => setShowPassword(false)} />
        </View>
      </AppModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {},
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 4 },
  card: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 10 },
  name: { fontWeight: "700", fontSize: 15 },
  tag: { fontWeight: "600", marginTop: 2, fontSize: 13 },
  role: { fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  linked: { fontSize: 12, marginTop: 6 },
  meta: { fontSize: 11, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  linkableRow: { padding: 10, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  linkableText: { fontSize: 13 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
});
