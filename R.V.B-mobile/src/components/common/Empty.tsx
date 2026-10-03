import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/theme/useTheme";

export function Empty({ title = "No data", message }: { title?: string; message?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: theme.colors.textSecondary }]}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, alignItems: "center" },
  title: { fontSize: 13, fontWeight: "700" },
  message: { marginTop: 6, fontSize: 12, textAlign: "center", lineHeight: 18 },
});
export const EmptyState = Empty;
