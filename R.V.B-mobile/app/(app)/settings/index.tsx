import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Avatar } from "@/components/common/Avatar";
import { useTheme } from "@/theme/useTheme";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/api/client";
import { isRTL } from "@/i18n";

export default function SettingsScreen() {
  const { theme, mode, setTheme } = useTheme();
  const { account, logout } = useAuthStore();
  const rtl = isRTL();
  const [prefs, setPrefs] = useState<{ language: string; theme: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    api
      .get<{ success: boolean; preferences: { ui: { language: string; theme: string } } }>("/api/rvb/auth/preferences")
      .then((r) => {
        if (mounted) setPrefs({ language: r.preferences.ui.language, theme: r.preferences.ui.theme });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const setLang = async (lang: "en" | "fr" | "ar") => {
    try {
      await api.patch("/api/rvb/auth/preferences", { ui: { language: lang } });
      setPrefs((p) => ({ language: lang, theme: p?.theme || "light" }));
      // Update auth store immediately so isRTL and language hooks re-render without pull-to-refresh
      const acc = useAuthStore.getState().account;
      if (acc) {
        useAuthStore.getState().setAccount({ ...acc, preferences: { ...(acc.preferences as any), ui: { ...(acc.preferences?.ui as any), language: lang } } } as any);
      }
      // Also refetch profile to ensure sync
      try {
        const me = await api.get<{ success: boolean; account: any }>("/api/rvb/auth/me");
        if (me.account) useAuthStore.getState().setAccount(me.account);
      } catch {}
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to update language");
    }
  };

  const handleLogout = async () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={[styles.content, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>Settings</Text>

        <Card>
          <View style={[styles.accountRow, rtl && { flexDirection: "row-reverse" }]}>
            <Avatar uri={account?.profilePicture || null} name={account?.displayName || "User"} size={56} />
            <View style={[styles.accountInfo, rtl && { alignItems: "flex-end", marginLeft: 0, marginRight: 12 }]}>
              <Text style={[styles.accountName, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>{account?.displayName}</Text>
              <Text style={[styles.accountTag, { color: theme.colors.primary }, rtl && { textAlign: "right" }]}>@{account?.tag}</Text>
              <Text style={[styles.accountRole, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{account?.role}</Text>
            </View>
          </View>
        </Card>

        <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Language</Text>
        <Card>
          <View style={[styles.langRow, rtl && { flexDirection: "row-reverse" }]}>
            {(["en", "fr", "ar"] as const).map((l) => {
              const active = (prefs?.language || account?.preferences?.ui?.language) === l;
              return (
                <Pressable key={l} onPress={() => setLang(l)} style={[styles.langBtn, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primary : theme.colors.surface }]}>
                  <Text style={[styles.langText, { color: active ? "#FCF6EF" : theme.colors.text }]}>{l.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: theme.colors.textTertiary }, rtl && { textAlign: "right" }]}>UI updates immediately • no pull-to-refresh needed</Text>
        </Card>

        <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>Theme</Text>
        <Card>
          <View style={[styles.langRow, rtl && { flexDirection: "row-reverse" }]}>
            {(["light", "dark", "system"] as const).map((t) => (
              <Pressable key={t} onPress={() => setTheme(t)} style={[styles.langBtn, { borderColor: mode === t ? theme.colors.primary : theme.colors.border, backgroundColor: mode === t ? theme.colors.primary : theme.colors.surface }]}>
                <Text style={[styles.langText, { color: mode === t ? "#FCF6EF" : theme.colors.text }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.hint, { color: theme.colors.textTertiary }, rtl && { textAlign: "right" }]}>Current: {mode} • resolves to {theme.dark ? "dark" : "light"}</Text>
        </Card>

        <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>About</Text>
        <Card>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Poultry Business Suite</Text>
          <Text style={[styles.cardHint, { color: theme.colors.textSecondary }]}>R.V.B Mobile • v1.0.0</Text>
          <Text style={[styles.cardHint, { color: theme.colors.textTertiary, marginTop: 8 }]}>Secure by design • Expo SDK 57 • React Native 0.86</Text>
        </Card>

        <View style={{ marginTop: 24 }}>
          <Button title="Sign out" onPress={handleLogout} variant="secondary" />
        </View>
        <Text style={[styles.hint, { color: theme.colors.textTertiary, textAlign: "center", marginTop: 12 }]}>Build: Hebrih Slaughter House • R.V.B</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: "800" },
  sectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 18, marginBottom: 8 },
  cardTitle: { fontWeight: "700", fontSize: 14 },
  cardHint: { marginTop: 4, fontSize: 12, lineHeight: 16 },
  accountRow: { flexDirection: "row", alignItems: "center" },
  accountInfo: { marginLeft: 12, flex: 1 },
  accountName: { fontSize: 16, fontWeight: "800" },
  accountTag: { fontWeight: "600", marginTop: 2, fontSize: 13 },
  accountRole: { fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  langRow: { flexDirection: "row", gap: 8 },
  langBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  langText: { fontWeight: "700", fontSize: 12 },
  hint: { marginTop: 8, fontSize: 11, lineHeight: 14 },
});
