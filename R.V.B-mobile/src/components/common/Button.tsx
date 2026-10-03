import React from "react";
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import { useTheme } from "@/theme/useTheme";

interface Props {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
  testID?: string;
  accessibilityRole?: string;
}

export function Button({ title, onPress, variant = "primary", loading, disabled, style, fullWidth, testID, accessibilityRole }: Props & { accessibilityRole?: any }) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;
  const bg =
    variant === "primary" ? theme.colors.primary : variant === "danger" ? theme.colors.error : variant === "secondary" ? theme.colors.surfaceElevated : "transparent";
  const borderColor = variant === "secondary" ? theme.colors.border : variant === "primary" ? theme.colors.primary : variant === "danger" ? theme.colors.error : "transparent";
  const textColor = variant === "primary" || variant === "danger" ? "#FCF6EF" : theme.colors.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        { backgroundColor: bg, borderColor, borderWidth: variant === "ghost" ? 0 : 1, opacity: isDisabled ? 0.5 : 1 },
        fullWidth && { width: "100%" },
        theme.dark ? theme.shadows.sm : theme.shadows.xs,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[styles.text, { color: textColor }]}>{title}</Text>}
    </Pressable>
  );
}

export function PrimaryButton(props: Omit<Props, "variant">) {
  return <Button {...props} variant="primary" />;
}
export function SecondaryButton(props: Omit<Props, "variant">) {
  return <Button {...props} variant="secondary" />;
}
export function DangerButton(props: Omit<Props, "variant">) {
  return <Button {...props} variant="danger" />;
}

const styles = StyleSheet.create({
  base: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: "center", justifyContent: "center", minHeight: 44 },
  text: { fontWeight: "700", fontSize: 13, letterSpacing: -0.1 },
});
