import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Screen } from "@/components/common/Screen";
import { AppHeader } from "@/components/layout/AppHeader";
import { useTheme } from "@/theme/useTheme";
import { useLanguage } from "@/i18n";
import MainChatsScreen from "../main-chats/index";
import SecondaryChatsScreen from "../secondary-chats/index";

type Tab = "main" | "secondary";

// Single Chats entry point for the bottom bar. Composes the existing
// Main/Secondary screens in bare mode (no duplicated chat logic): routes,
// conversation opening, unread badges, sockets, and role filtering all live
// in those screens unchanged.
export default function ChatsHubScreen() {
  const { theme } = useTheme();
  const { t, isRTL } = useLanguage();
  const [tab, setTab] = useState<Tab>("main");

  return (
    <Screen padded={false}>
      <AppHeader title={t("chats.title", "Chats")} showNotifications />
      <View style={[styles.toggleRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, isRTL && { flexDirection: "row-reverse" }]}>
        {(["main", "secondary"] as const).map((key) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              onPress={() => setTab(key)}
              style={[styles.toggleBtn, active && { backgroundColor: theme.colors.primary }]}
            >
              <Text style={[styles.toggleText, { color: active ? "#FCF6EF" : theme.colors.text }]}>
                {key === "main" ? t("chats.main", "Main") : t("chats.secondary", "Secondary")}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {tab === "main" ? <MainChatsScreen bare /> : <SecondaryChatsScreen bare />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: "row", marginHorizontal: 16, marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  toggleText: { fontWeight: "700", fontSize: 13 },
});
