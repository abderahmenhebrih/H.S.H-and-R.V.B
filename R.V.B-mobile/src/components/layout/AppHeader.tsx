import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTheme } from "@/theme/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { isRTL } from "@/i18n";
import { getUnreadCount } from "@/services/notification.service";
import { getSocket } from "@/services/socket";

export function AppHeader({ title, subtitle, showBack, showNotifications, unreadCount: propUnread }: { title: string; subtitle?: string; showBack?: boolean; showNotifications?: boolean; unreadCount?: number }) {
  const { theme } = useTheme();
  const router = useRouter();
  const rtl = isRTL();
  const [unread, setUnread] = useState<number | undefined>(propUnread);
  useEffect(() => {
    if (!showNotifications) return;
    if (propUnread !== undefined) {
      setUnread(propUnread);
      return;
    }
    let mounted = true;
    const fetchCount = async () => {
      try {
        const c = await getUnreadCount();
        if (mounted) setUnread(c);
      } catch {}
    };
    fetchCount();
    const s = getSocket();
    if (s) {
      const onNotif = () => fetchCount();
      s.on("rvb:notification", onNotif);
      return () => {
        s.off("rvb:notification", onNotif);
      };
    }
    return undefined;
  }, [showNotifications, propUnread]);
  const unreadCount = unread;
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
      {showNotifications ? (
        <Pressable onPress={() => router.push("/(app)/notifications" as any)} style={[styles.bell, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceHover }]}>
          <Ionicons name="notifications-outline" size={20} color={theme.colors.text} />
          {unreadCount && unreadCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.colors.error }]}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : String(unreadCount)}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, borderBottomWidth: 1 },
  left: { flexDirection: "row", alignItems: "center", flex: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 2 },
  bell: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
});
