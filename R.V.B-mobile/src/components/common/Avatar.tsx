import React from "react";
import { View, Image, Text, StyleSheet } from "react-native";
import { useTheme } from "@/theme/useTheme";

export function Avatar({ uri, name, size = 64 }: { uri?: string | null; name: string; size?: number }) {
  const { theme } = useTheme();
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.border }} />;
  }
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.primary }]}>
      <Text style={[styles.initials, { fontSize: size * 0.35 }]}>{initials || "?"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#FCF6EF", fontWeight: "700" },
});
