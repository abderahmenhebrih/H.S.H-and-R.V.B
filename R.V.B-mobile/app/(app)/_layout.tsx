import React, { useEffect } from "react";
import { Tabs } from "expo-router";
import { useAuthStore } from "@/stores/auth-store";
import { connectSocket } from "@/services/socket";
import { useTheme } from "@/theme/useTheme";
import { Ionicons } from "@expo/vector-icons";

export default function AppTabsLayout() {
  const { accessToken } = useAuthStore();
  const { theme } = useTheme();

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
        tabBarStyle: { backgroundColor: theme.colors.tabBackground, borderTopColor: theme.colors.border, height: 62, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="main-chats"
        options={{
          title: "Main Chats",
          tabBarLabel: "Main Chats",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="secondary-chats"
        options={{
          title: "Secondary Chats",
          tabBarLabel: "Secondary",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarLabel: "Search",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "search" : "search-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarLabel: "Settings",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "settings" : "settings-outline"} size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
