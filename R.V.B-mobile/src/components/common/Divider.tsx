import React from "react";
import { View } from "react-native";
import { useTheme } from "@/theme/useTheme";

export function Divider({ vertical, style }: { vertical?: boolean; style?: any }) {
  const { theme } = useTheme();
  if (vertical) return <View style={[{ width: 1, backgroundColor: theme.colors.border }, style]} />;
  return <View style={[{ height: 1, backgroundColor: theme.colors.border }, style]} />;
}
