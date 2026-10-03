import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "@/theme/useTheme";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  elevated?: boolean;
}

export function Card({ children, style, padded = true, elevated = false }: Props) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
        },
        elevated ? theme.shadows.card : theme.shadows.xs,
        padded && { padding: 12 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.md }, theme.shadows.xs, { padding: 12 }, style]}>
      {children}
    </View>
  );
}

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.xs]}>
      <View style={[styles.statIcon, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primaryRing }]}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary }} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.statValue, { color: theme.colors.text }]}>{value}</Text>
        {sub ? <Text style={[styles.statSub, { color: theme.colors.textTertiary }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, overflow: "hidden" },
  statCard: { width: "48%", borderRadius: 12, padding: 12, borderWidth: 1, minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10 },
  statIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  statLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { marginTop: 4, fontSize: 15, fontWeight: "800" },
  statSub: { marginTop: 2, fontSize: 11 },
});
