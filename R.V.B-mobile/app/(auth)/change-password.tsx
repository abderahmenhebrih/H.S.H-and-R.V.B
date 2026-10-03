import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { useAuthStore } from "@/stores/auth-store";
import { RvbApiError } from "@/types/rvb";
import { useRouter } from "expo-router";

export default function ChangePasswordScreen() {
  const { changePassword, isLoading, account } = useAuthStore();
  const router = useRouter();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    if (!currentPassword) {
      setError("Current password is required");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      setSuccess("Password changed. Continuing...");
      // router will auto-redirect via gate to onboarding or app
    } catch (e: any) {
      if (e instanceof RvbApiError) setError(e.message);
      else setError(e?.message || "Failed to change password");
    }
  };

  return (
    <Screen scroll padded>
      <View style={styles.header}>
        <Text style={styles.title}>Change Password</Text>
        <Text style={styles.subtitle}>You must change your password before continuing.</Text>
        {account ? <Text style={styles.account}>{account.tag} — {account.role}</Text> : null}
      </View>
      <View style={styles.card}>
        <Input label="Current password" value={currentPassword} onChangeText={setCurrent} placeholder="Current" secureTextEntry />
        <Input label="New password" value={newPassword} onChangeText={setNew} placeholder="At least 8 characters" secureTextEntry />
        <Input label="Confirm new password" value={confirmPassword} onChangeText={setConfirm} placeholder="Confirm" secureTextEntry />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}
        <Button title="Update password" onPress={handleSubmit} loading={isLoading} />
        <Text style={styles.hint}>You cannot bypass this step.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16, alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  subtitle: { marginTop: 6, color: "#64748B", textAlign: "center" },
  account: { marginTop: 6, color: "#0F766E", fontWeight: "600" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#E2E8F0" },
  error: { color: "#DC2626", textAlign: "center", marginBottom: 8 },
  success: { color: "#059669", textAlign: "center", marginBottom: 8 },
  hint: { marginTop: 12, color: "#94A3B8", fontSize: 11, textAlign: "center" },
});
