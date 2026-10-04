import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { Loading } from "@/components/common/Loading";
import { getWorkerPortal, createLoanRequest, getConfig } from "@/services/worker.service";
import { formatCurrency, parseAmountInput } from "@/utils/currency";
import { useRouter } from "expo-router";
import { isRTL } from "@/i18n";

export default function LoanApplicationScreen() {
  const router = useRouter();
  const [credit, setCredit] = useState<number | null>(null);
  const [currency, setCurrency] = useState("DA");
  const [amountStr, setAmountStr] = useState("");
  const [description, setDescription] = useState("");
  const [loadingCredit, setLoadingCredit] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [w, c] = await Promise.all([getWorkerPortal(), getConfig().catch(() => ({ currency: "DA" } as any))]);
        setCredit(w.worker.balance);
        setCurrency(c.currency || "DA");
      } catch (e: any) {
        setError(e?.message || "Failed to load credit");
      } finally {
        setLoadingCredit(false);
      }
    })();
  }, []);

  const amount = parseAmountInput(amountStr);
  const rtl = isRTL();

  const validate = (): string | null => {
    if (amount === null || !Number.isFinite(amount)) return "Enter a valid amount";
    if (amount <= 0) return "Amount must be > 0";
    if (credit !== null && amount <= credit) return `Loan must be > Current Credit (${formatCurrency(credit, currency)})`;
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
      await createLoanRequest(amount!, description.trim() || undefined);
      Alert.alert("Success", "Loan application submitted for review.", [{ text: "OK", onPress: () => router.back() }]);
      setAmountStr("");
      setDescription("");
    } catch (e: any) {
      const code = e?.code;
      if (code === "RVB_LOAN_AMOUNT_INVALID") setError(`Loan must be > Current Credit (${credit !== null ? formatCurrency(credit, currency) : ""})`);
      else if (code === "RVB_AMOUNT_REQUIRED") setError("Amount is required and must be > 0");
      else setError(e?.message || "Failed to submit loan");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCredit) return <Loading message="Loading credit..." />;

  return (
    <Screen padded scroll>
      <Text style={[styles.title, rtl && { textAlign: "right" }]}>Loan Application</Text>
      <Text style={[styles.subtitle, rtl && { textAlign: "right" }]}>Accepted loan increases balance only after management approval.</Text>

      <View style={styles.card}>
        <Text style={[styles.label, rtl && { textAlign: "right" }]}>Current Credit</Text>
        <Text style={[styles.credit, rtl && { textAlign: "right" }]}>{credit !== null ? formatCurrency(credit, currency) : "-"}</Text>
        <Text style={[styles.hint, rtl && { textAlign: "right" }]}>Example: Current Credit 50,000 → Loan 50,000 REJECT, 50,001 ALLOWED</Text>
      </View>

      <View style={styles.form}>
        <Input label={`Amount (${currency})`} value={amountStr} onChangeText={setAmountStr} placeholder="e.g. 50001" />
        <Input label="Description (optional)" value={description} onChangeText={setDescription} placeholder="Reason" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Submit Loan Application" onPress={handleSubmit} loading={submitting} disabled={submitting} />
        <Text style={styles.hint}>Do not increase credit locally. Only backend acceptance changes balance exactly once.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  subtitle: { marginTop: 6, color: "#64748B", fontSize: 13 },
  card: { marginTop: 16, backgroundColor: "#fff", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  label: { fontSize: 11, color: "#64748B", fontWeight: "600", textTransform: "uppercase" },
  credit: { marginTop: 4, fontSize: 18, fontWeight: "800", color: "#0F766E" },
  form: { marginTop: 16, backgroundColor: "#fff", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  error: { color: "#DC2626", textAlign: "center", marginBottom: 8, fontSize: 13 },
  hint: { marginTop: 8, color: "#94A3B8", fontSize: 11, textAlign: "center" },
});
