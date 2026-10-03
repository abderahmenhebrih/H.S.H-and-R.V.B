import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme/useTheme";

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: any;
}

export function Screen({ children, scroll = false, padded = true, style }: Props) {
  const { theme } = useTheme();
  const content = <View style={[styles.container, padded && styles.padded, style]}>{children}</View>;
  if (scroll) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top", "bottom"]}>
      <View style={styles.flex}>{content}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: { flex: 1 },
  padded: { padding: 16 },
  scroll: { flexGrow: 1, paddingBottom: 24 },
});
