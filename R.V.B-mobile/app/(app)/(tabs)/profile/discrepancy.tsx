import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Alert } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Button } from "@/components/common/Button";
import { createDiscrepancyRequest } from "@/services/worker.service";
import { useRouter } from "expo-router";
import { isRTL } from "@/i18n";

export default function DiscrepancyScreen() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rtl = isRTL();
  const trimmed = description.trim();
  const count = description.length;
  const remaining = 2000 - count;

  const validate = (): string | null => {
    if (!trimmed) return "Description is required";
    if (count > 2000) return "Description must be ≤ 2000 characters";
    return null;
  };

  const handleSubmit = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await createDiscrepancyRequest(trimmed);
      Alert.alert("Success", "Discrepancy report submitted for review.", [{ text: "OK", onPress: () => router.back() }]);
      setDescription("");
    } catch (e: any) {
      const code = e?.code;
      if (code === "RVB_DESCRIPTION_REQUIRED") setError("Description is required");
      else if (code === "RVB_DESCRIPTION_TOO_LONG") setError("Description must be ≤ 2000 characters");
      else setError(e?.message || "Failed to submit discrepancy");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen padded scroll>
      <Text style={[styles.title, rtl && { textAlign: "right" }]}>Discrepancy Report</Text>
      <Text style={[styles.subtitle, rtl && { textAlign: "right" }]}>Report a discrepancy. This creates a review request only and does not directly mutate salary, balance, bonus, absence or payments.</Text>

      <View style={styles.form}>
        <Text style={[styles.label, rtl && { textAlign: "right" }]}>Description *</Text>
        <TextInput
          style={[styles.textArea, rtl && { textAlign: "right" }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the discrepancy..."
          multiline
          numberOfLines={6}
          maxLength={2001}
          textAlignVertical="top"
          placeholderTextColor="#94A3B8"
        />
        <View style={styles.counterRow}>
          <Text style={[styles.counter, count > 2000 && styles.counterError, remaining < 0 && styles.counterError]}>{count} / 2000</Text>
          <Text style={styles.counterHint}>{remaining >= 0 ? `${remaining} remaining` : `${-remaining} over limit`}</Text>
        </View>
        <Text style={styles.examples}>0/2000 → block (empty) • 2000 → allow • 2001 → block</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Submit Discrepancy" onPress={handleSubmit} loading={submitting} disabled={submitting} />
        <Text style={styles.hint}>Discrepancy will not alter financial data until reviewed.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  subtitle: { marginTop: 6, color: "#64748B", fontSize: 13 },
  form: { marginTop: 16, backgroundColor: "#fff", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  label: { fontSize: 11, color: "#64748B", fontWeight: "600", textTransform: "uppercase", marginBottom: 6 },
  textArea: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 10, padding: 12, fontSize: 14, color: "#0F172A", minHeight: 120, backgroundColor: "#fff" },
  counterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  counter: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  counterError: { color: "#DC2626" },
  counterHint: { fontSize: 12, color: "#94A3B8" },
  examples: { marginTop: 4, color: "#94A3B8", fontSize: 11, textAlign: "center" },
  error: { color: "#DC2626", textAlign: "center", marginTop: 8, marginBottom: 8, fontSize: 13 },
  hint: { marginTop: 8, color: "#94A3B8", fontSize: 11, textAlign: "center" },
});
