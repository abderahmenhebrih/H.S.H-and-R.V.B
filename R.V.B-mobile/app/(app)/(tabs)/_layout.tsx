import React, { useEffect } from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/stores/auth-store";
import { connectSocket } from "@/services/socket";
import { useTheme } from "@/theme/useTheme";
import { useLanguage } from "@/i18n";
import { Ionicons } from "@expo/vector-icons";

// Bottom-tab navigator. The individual conversation (chat/[id]) lives OUTSIDE
// this Tabs tree — as a sibling Stack screen in app/(app)/_layout.tsx — so the
// bottom bar is visible on the Chats hub / Main / Secondary lists but disappears
// completely inside an open conversation. Route groups "(tabs)" do not affect
// URLs, so /(app)/chat/<id> deep links and router.push targets are unchanged.
export default function AppTabsLayout() {
  const { accessToken } = useAuthStore();
  const { theme } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  useEffect(() => {
    if (accessToken) connectSocket(accessToken);
  }, [accessToken]);

  return (
    <Tabs
      initialRouteName="profile"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.tabInactive,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBackground,
          borderTopColor: theme.colors.border,
          height: 62 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: t("tabs.chats", "Chats"),
          tabBarLabel: t("tabs.chats", "Chats"),
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile", "Profile"),
          tabBarLabel: t("tabs.profile", "Profile"),
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t("tabs.search", "Search"),
          tabBarLabel: t("tabs.search", "Search"),
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "search" : "search-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.settings", "Settings"),
          tabBarLabel: t("tabs.settings", "Settings"),
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "settings" : "settings-outline"} size={22} color={color} />,
        }}
      />
      {/* Kept navigable, hidden from the bar: the hub composes the two chat
          lists, notifications live behind the header bell. */}
      <Tabs.Screen name="main-chats" options={{ href: null }} />
      <Tabs.Screen name="secondary-chats" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}
