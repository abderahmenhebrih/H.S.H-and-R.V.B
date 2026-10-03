import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTheme } from "@/theme/useTheme";

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: theme.colors.textSecondary }]}>{message}</Text> : null}
      {onRetry ? (
        <Pressable onPress={onRetry} style={[styles.button, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  message: { marginTop: 8, fontSize: 13, textAlign: "center", lineHeight: 18 },
  button: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, minHeight: 44, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#FCF6EF", fontWeight: "700", fontSize: 13 },
});
