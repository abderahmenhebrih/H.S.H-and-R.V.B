import React, { useState } from "react";
import { View, Text, Image, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions, Pressable, Linking } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/api/client";
import { normalizeTag, isValidTag } from "@/utils/tag";
import { RvbApiError } from "@/types/rvb";
import { useTheme } from "@/theme/useTheme";
import { useLanguage, type Language } from "@/i18n";
import { usePreLoginLanguage } from "@/i18n/pre-login-language";

const LINKEDIN_URL = "https://www.linkedin.com/in/aderahmen-hebrih-4401a3412/";

const LANG_OPTIONS: ReadonlyArray<{ code: Language; short: string; name: string }> = [
  { code: "en", short: "EN", name: "English" },
  { code: "fr", short: "FR", name: "Français" },
  { code: "ar", short: "AR", name: "العربية" },
];

export default function LoginScreen() {
  const { login, isLoading, error } = useAuthStore();
  const { theme } = useTheme();
  const { t, isRTL } = useLanguage();
  const { lang: preLoginLang, setLang: setPreLoginLang } = usePreLoginLanguage();
  const { width } = useWindowDimensions();
  const [tag, setTag] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [fieldErrorKey, setFieldErrorKey] = useState<"tag" | "password" | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Android autofill is disabled for login (native credential layer was
  // seizing focus ~40ms after tag tap on hardware). iOS keeps semantic
  // hints; web keeps normal autocomplete.
  const isAndroid = Platform.OS === "android";

  const handleLogin = async () => {
    // Prevent duplicate submit while a login attempt is already in flight
    // (e.g. rapid Done presses); the Button also disables via isLoading.
    if (isLoading) return;
    setFieldError(null);
    setFieldErrorKey(null);
    setApiError(null);
    const normalized = normalizeTag(tag);
    if (!normalized) {
      setFieldError(t("login.tagRequired", "Tag is required"));
      setFieldErrorKey("tag");
      return;
    }
    if (!isValidTag(normalized)) {
      setFieldError(t("login.tagInvalid", "Invalid tag. Use 3-30 chars: a-z 0-9 . _"));
      setFieldErrorKey("tag");
      return;
    }
    if (!password) {
      setFieldError(t("login.passwordRequired", "Password is required"));
      setFieldErrorKey("password");
      return;
    }
    try {
      await login(tag, password);
      // Adopt the pre-login selection as the initial server preference ONLY
      // when the account has no meaningful language yet. An existing account
      // preference is authoritative and is never overwritten here.
      try {
        const account = useAuthStore.getState().account;
        const stored = account?.preferences?.ui?.language;
        if ((!stored || !["en", "fr", "ar"].includes(stored)) && account) {
          await api.patch("/api/rvb/auth/preferences", { ui: { language: preLoginLang } });
          useAuthStore.getState().setAccount({
            ...account,
            preferences: { ...(account.preferences as any), ui: { ...(account.preferences?.ui as any), language: preLoginLang } },
          } as any);
        }
      } catch {}
    } catch (e: any) {
      if (e instanceof RvbApiError) {
        if (e.code === "RVB_AUTH_INVALID_CREDENTIALS") {
          setApiError(t("login.invalidCredentials", "Invalid tag or password"));
        } else if (e.code === "RVB_AUTH_TEMPORARILY_LOCKED") {
          setApiError(t("login.temporarilyLocked", "Account temporarily locked (5 failed attempts, 15m). Try later."));
        } else if (e.code === "NETWORK_ERROR") {
          setApiError(t("login.networkError", "Network error. Check connection and EXPO_PUBLIC_RVB_API_URL"));
        } else {
          setApiError(e.message || t("login.loginFailed", "Login failed"));
        }
      } else {
        setApiError(e?.message || t("login.loginFailed", "Login failed"));
      }
    }
  };

  const handleContactAdmin = async () => {
    setLinkError(null);
    try {
      await Linking.openURL(LINKEDIN_URL);
    } catch {
      setLinkError(t("login.linkOpenFailed", "Could not open the link. Please try again later."));
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

            <View
              style={styles.langRow}
              accessibilityRole="radiogroup"
              accessibilityLabel="Language / Langue / اللغة"
            >
              {LANG_OPTIONS.map((opt) => {
                const selected = preLoginLang === opt.code;
                return (
                  <Pressable
                    key={opt.code}
                    onPress={() => setPreLoginLang(opt.code)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={opt.name}
                    style={[
                      styles.langPill,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.langPillText,
                        { color: selected ? "#fff" : theme.colors.textSecondary },
                      ]}
                    >
                      {opt.short}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.card, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }, theme.shadows.card]}>
              <Text style={[styles.cardHeading, { color: theme.colors.text }]}>{t("login.signInTitle", "Sign in")}</Text>

              <Input
                label={t("login.tagLabel", "@tag")}
                labelStyle={isRTL ? { textAlign: "right" } : undefined}
                inputStyle={{ textAlign: "left" }}
                value={tag}
                onChangeText={setTag}
                placeholder={t("login.tagPlaceholder", "@abattoire")}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={isAndroid ? "off" : "username"}
                textContentType={isAndroid ? undefined : "username"}
                importantForAutofill={isAndroid ? "no" : undefined}
                returnKeyType="done"
                submitBehavior="submit"
                error={fieldErrorKey === "tag" ? fieldError : null}
              />
              <Input
                label={t("login.passwordLabel", "Password")}
                labelStyle={isRTL ? { textAlign: "right" } : undefined}
                inputStyle={isRTL ? { textAlign: "right" } : undefined}
                showLabel={t("login.show", "Show")}
                hideLabel={t("login.hide", "Hide")}
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
                error={fieldErrorKey === "password" ? fieldError : null}
              />

              {apiError ? <Text style={[styles.apiError, { color: theme.colors.error }]}>{apiError}</Text> : null}
              {error && !apiError ? <Text style={[styles.apiError, { color: theme.colors.error }]}>{error}</Text> : null}

              <Button title={t("login.signInTitle", "Sign in")} onPress={handleLogin} loading={isLoading} style={styles.signInButton} />

              <Text style={[styles.helpLine, { color: theme.colors.textSecondary }]}>{t("login.forgot", "Forgot your credentials?")}</Text>
              <Pressable
                onPress={handleContactAdmin}
                accessibilityRole="button"
                accessibilityLabel={t("login.contactAdmin", "Contact your administrator")}
                style={({ pressed }) => [styles.adminPress, pressed && styles.adminPressed]}
              >
                <Text style={styles.adminLine}>{t("login.contactAdmin", "Contact your administrator")}</Text>
              </Pressable>
              {linkError ? <Text style={[styles.linkError, { color: theme.colors.error }]}>{linkError}</Text> : null}
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
  title: { fontSize: 24, fontWeight: "800", textAlign: "center", marginBottom: 16 },
  langRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  langPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  langPillText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  card: { width: "100%", borderRadius: 22, padding: 24, borderWidth: 1 },
  cardHeading: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 20 },
  apiError: { fontSize: 13, marginTop: 4, marginBottom: 8, textAlign: "center" },
  signInButton: { marginTop: 12, height: 54 },
  helpLine: { marginTop: 16, fontSize: 12, textAlign: "center" },
  adminPress: { marginTop: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  adminPressed: { opacity: 0.6 },
  adminLine: { fontSize: 13, fontWeight: "700", textAlign: "center", color: TEAL_ACCENT },
  linkError: { fontSize: 12, marginTop: 6, textAlign: "center" },
});
