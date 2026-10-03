import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { useAuthStore } from "@/stores/auth-store";
import { normalizeTag, isValidTag } from "@/utils/tag";
import { RvbApiError } from "@/types/rvb";

export default function LoginScreen() {
  const { login, isLoading, error } = useAuthStore();
  const [tag, setTag] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleLogin = async () => {
    setFieldError(null);
    setApiError(null);
    const normalized = normalizeTag(tag);
    if (!normalized) {
      setFieldError("Tag is required");
      return;
    }
    if (!isValidTag(normalized)) {
      setFieldError("Invalid tag. Use 3-30 chars: a-z 0-9 . _");
      return;
    }
    if (!password) {
      setFieldError("Password is required");
      return;
    }
    try {
      await login(tag, password);
    } catch (e: any) {
      if (e instanceof RvbApiError) {
        if (e.code === "RVB_AUTH_INVALID_CREDENTIALS") {
          setApiError("Invalid tag or password");
        } else if (e.code === "RVB_AUTH_TEMPORARILY_LOCKED") {
          setApiError("Account temporarily locked (5 failed attempts, 15m). Try later.");
        } else if (e.code === "NETWORK_ERROR") {
          setApiError("Network error. Check connection and EXPO_PUBLIC_RVB_API_URL");
        } else {
          setApiError(e.message || "Login failed");
        }
      } else {
        setApiError(e?.message || "Login failed");
      }
    }
  };

  return (
    <Screen scroll padded>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Poultry Business Suite</Text>
            <Text style={styles.subtitle}>R.V.B — Sign in</Text>
            <Text style={styles.hint}>Use your @tag and password</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="@tag"
              value={tag}
              onChangeText={setTag}
              placeholder="@abattoire"
              autoCapitalize="none"
              autoCorrect={false}
              error={fieldError && fieldError.toLowerCase().includes("tag") ? fieldError : null}
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              error={fieldError && fieldError.toLowerCase().includes("password") ? fieldError : null}
            />

            {apiError ? <Text style={styles.apiError}>{apiError}</Text> : null}
            {error && !apiError ? <Text style={styles.apiError}>{error}</Text> : null}

            <Button title="Sign in" onPress={handleLogin} loading={isLoading} style={{ marginTop: 8 }} />

            <Text style={styles.footerNote}>Physical device: use LAN IP (not localhost) in EXPO_PUBLIC_RVB_API_URL</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", paddingVertical: 24 },
  header: { alignItems: "center", marginBottom: 24 },
  title: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  subtitle: { marginTop: 6, fontSize: 16, fontWeight: "600", color: "#0F766E" },
  hint: { marginTop: 4, color: "#64748B", fontSize: 13 },
  form: { backgroundColor: "#fff", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  apiError: { color: "#DC2626", fontSize: 13, marginBottom: 8, textAlign: "center" },
  footerNote: { marginTop: 12, color: "#94A3B8", fontSize: 11, textAlign: "center" },
});
