import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/theme/useTheme";

type Status = "under_review" | "accepted" | "rejected" | "cancelled" | "active" | "archived" | string;

export function StatusBadge({ status }: { status: Status }) {
  const { theme } = useTheme();
  const s = String(status || "").toLowerCase();
  let bg: string = theme.colors.statusUnderReviewBg as string;
  let border: string = theme.colors.statusUnderReviewBorder as string;
  let text: string = theme.colors.statusUnderReviewText as string;
  let label = String(status);

  if (s === "accepted" || s === "active") {
    bg = theme.colors.statusAcceptedBg;
    border = theme.colors.statusAcceptedBorder;
    text = theme.colors.statusAcceptedText;
    label = s === "active" ? "Active" : "Accepted";
  } else if (s === "rejected" || s === "archived") {
    bg = theme.colors.statusRejectedBg;
    border = theme.colors.statusRejectedBorder;
    text = theme.colors.statusRejectedText;
    label = s.charAt(0).toUpperCase() + s.slice(1);
  } else if (s === "cancelled") {
    bg = theme.colors.statusCancelledBg;
    border = theme.colors.statusCancelledBorder;
    text = theme.colors.statusCancelledText;
    label = "Cancelled";
  } else if (s === "under_review") {
    label = "Under Review";
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.text, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  text: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
});
