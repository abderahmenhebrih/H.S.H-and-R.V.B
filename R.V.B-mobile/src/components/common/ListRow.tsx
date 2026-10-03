import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTheme } from "@/theme/useTheme";
import { isRTL } from "@/i18n";

export function ListRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const { theme } = useTheme();
  const rtl = isRTL();
  const content = (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }, rtl && { flexDirection: "row-reverse" }]}>
      <Text style={[styles.label, { color: theme.colors.textSecondary }, rtl && { textAlign: "right" }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.colors.text }, rtl && { textAlign: "left" }]}>{value}</Text>
    </View>
  );
  if (onPress) return <Pressable onPress={onPress}>{content}</Pressable>;
  return content;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1 },
  label: { fontSize: 12, flex: 1, fontWeight: "600" },
  value: { fontSize: 13, fontWeight: "700", flex: 1, textAlign: "right" },
});
