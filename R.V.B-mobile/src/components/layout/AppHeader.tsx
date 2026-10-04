import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTheme } from "@/theme/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { isRTL } from "@/i18n";
import { NotificationBell } from "@/components/common/NotificationBell";

export function AppHeader({ title, subtitle, showBack, showNotifications, unreadCount: propUnread }: { title: string; subtitle?: string; showBack?: boolean; showNotifications?: boolean; unreadCount?: number }) {
  const { theme } = useTheme();
  const router = useRouter();
  const rtl = isRTL();
  return (
    <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }, rtl && { flexDirection: "row-reverse" }]}>
      <View style={[styles.left, rtl && { flexDirection: "row-reverse" }]}>
        {showBack ? (
          <Pressable onPress={() => router.back()} style={[styles.iconBtn, { borderColor: theme.colors.border }]} hitSlop={8}>
            <Ionicons name={rtl ? "chevron-forward" : "chevron-back"} size={20} color={theme.colors.text} />
          </Pressable>
        ) : null}
        <View style={{ marginLeft: showBack ? 8 : 0, marginRight: rtl && showBack ? 8 : 0 }}>
          <Text style={[styles.title, { color: theme.colors.text }, rtl && { textAlign: "right" }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{subtitle}</Text> : null}
        </View>
      </View>
      {showNotifications ? <NotificationBell unreadCount={propUnread} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Shared authenticated top breathing room: sits below the safe-area inset
  // on every AppHeader screen (phone + web) with no per-page margins.
  header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, borderBottomWidth: 1, marginTop: 12 },
  left: { flexDirection: "row", alignItems: "center", flex: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 2 },
});
