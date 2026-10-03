import React from "react";
import { View, TextInput, StyleSheet, Pressable, Text } from "react-native";
import { useTheme } from "@/theme/useTheme";
import { Ionicons } from "@expo/vector-icons";

export function SearchField({ value, onChangeText, placeholder = "Search..." }: { value: string; onChangeText: (t: string) => void; placeholder?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.colors.textTertiary} style={[styles.input, { color: theme.colors.text }]} />
      {value ? (
        <Pressable onPress={() => onChangeText("")}>
          <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44, gap: 8 },
  input: { flex: 1, fontSize: 13 },
});
