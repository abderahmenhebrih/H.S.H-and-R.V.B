import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTheme } from "@/theme/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getUnreadCount } from "@/services/notification.service";
import { getSocket } from "@/services/socket";

// Single notification-bell implementation for the whole app: unread count
// fetch, 99+ badge, live socket refresh, navigation to /(app)/notifications.
// Used by AppHeader and embedded inside profile identity cards — never duplicated.
export function NotificationBell({ unreadCount: propUnread }: { unreadCount?: number }) {
  const { theme } = useTheme();
  const router = useRouter();
  const [unread, setUnread] = useState<number | undefined>(propUnread);
  useEffect(() => {
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
  }, [propUnread]);
  return (
    <Pressable onPress={() => router.push("/(app)/notifications" as any)} style={[styles.bell, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceHover }]} accessibilityRole="button">
      <Ionicons name="notifications-outline" size={20} color={theme.colors.text} />
      {unread && unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.colors.error }]}>
          <Text style={styles.badgeText}>{unread > 99 ? "99+" : String(unread)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
});
