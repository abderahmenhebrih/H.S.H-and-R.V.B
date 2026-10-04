import React, { useState } from "react";
import { View, Text, Image, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { useAuthStore } from "@/stores/auth-store";
import { normalizeTag, isValidTag } from "@/utils/tag";
import { RvbApiError } from "@/types/rvb";
import { useTheme } from "@/theme/useTheme";

export default function LoginScreen() {
  const { login, isLoading, error } = useAuthStore();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [tag, setTag] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Android autofill is disabled for login (native credential layer was
  // seizing focus ~40ms after tag tap on hardware). iOS keeps semantic
  // hints; web keeps normal autocomplete.
  const isAndroid = Platform.OS === "android";

  const handleLogin = async () => {
    // Prevent duplicate submit while a login attempt is already in flight
    // (e.g. rapid Done presses); the Button also disables via isLoading.
    if (isLoading) return;
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
    <Screen padded={false} style={{ backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.center, { width: Math.min(width * 0.92, 440) }]}>
            <Image
              source={require("../../assets/chickenicon.png")}
              style={styles.logo}
              resizeMode="contain"
              accessibilityRole="image"
            />
            <Text style={[styles.title, { color: theme.colors.text }]}>Poultry Business Suite</Text>

            <View style={[styles.card, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }, theme.shadows.card]}>
              <Text style={[styles.cardHeading, { color: theme.colors.text }]}>Sign in</Text>

              <Input
                label="@TAG"
                value={tag}
                onChangeText={setTag}
                placeholder="@abattoire"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={isAndroid ? "off" : "username"}
                textContentType={isAndroid ? undefined : "username"}
                importantForAutofill={isAndroid ? "no" : undefined}
                returnKeyType="done"
                submitBehavior="submit"
                error={fieldError && fieldError.toLowerCase().includes("tag") ? fieldError : null}
              />
              <Input
                label="PASSWORD"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                autoComplete={isAndroid ? "off" : "current-password"}
                textContentType={isAndroid ? undefined : "password"}
                importantForAutofill={isAndroid ? "no" : undefined}
                returnKeyType="done"
                submitBehavior="submit"
                onSubmitEditing={handleLogin}
                error={fieldError && fieldError.toLowerCase().includes("password") ? fieldError : null}
              />

              {apiError ? <Text style={[styles.apiError, { color: theme.colors.error }]}>{apiError}</Text> : null}
              {error && !apiError ? <Text style={[styles.apiError, { color: theme.colors.error }]}>{error}</Text> : null}

              <Button title="Sign in" onPress={handleLogin} loading={isLoading} style={styles.signInButton} />

              <Text style={[styles.helpLine, { color: theme.colors.textSecondary }]}>Forgot your credentials?</Text>
              <Text style={styles.adminLine}>Contact your administrator</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const TEAL_ACCENT = "#0F766E";

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 32, paddingHorizontal: 16 },
  center: { alignItems: "center" },
  logo: { width: 120, height: 120, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "800", textAlign: "center", marginBottom: 20 },
  card: { width: "100%", borderRadius: 22, padding: 24, borderWidth: 1 },
  cardHeading: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 20 },
  apiError: { fontSize: 13, marginTop: 4, marginBottom: 8, textAlign: "center" },
  signInButton: { marginTop: 12, height: 54 },
  helpLine: { marginTop: 16, fontSize: 12, textAlign: "center" },
  adminLine: { marginTop: 4, fontSize: 13, fontWeight: "700", textAlign: "center", color: TEAL_ACCENT },
});
