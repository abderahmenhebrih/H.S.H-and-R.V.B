import React from "react";
import { Modal as RNModal, View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useTheme } from "@/theme/useTheme";
import { Button } from "./Button";

export function AppModal({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.modal]}>
          {title ? (
            <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
              <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
              <Pressable onPress={onClose} style={[styles.close, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceHover }]}>
                <Text style={{ color: theme.colors.text, fontWeight: "700" }}>×</Text>
              </Pressable>
            </View>
          ) : null}
          <ScrollView contentContainerStyle={{ padding: 16 }}>{children}</ScrollView>
        </View>
      </View>
    </RNModal>
  );
}

export function ConfirmModal({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  confirmLoading = false,
  error = null,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  confirmLoading?: boolean;
  error?: string | null;
}) {
  const { theme } = useTheme();
  const busy = confirmLoading;
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={[styles.cardSmall, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.modal]}>
          <Text style={[styles.title, styles.centerText, { color: theme.colors.text, marginBottom: 8 }]}>{title}</Text>
          {message ? <Text style={[styles.centerText, { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18 }]}>{message}</Text> : null}
          {error ? <Text style={[styles.centerText, { color: theme.colors.error, fontSize: 12, marginTop: 8 }]}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16, justifyContent: "flex-end" }}>
            <Button title={cancelLabel} variant="secondary" onPress={onClose} disabled={busy} testID="confirm-modal-cancel" />
            <Button title={confirmLabel} variant={variant} onPress={onConfirm} loading={busy} testID="confirm-modal-confirm" />
          </View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
  card: { borderRadius: 16, borderWidth: 1, maxHeight: "85%", overflow: "hidden" },
  cardSmall: { borderRadius: 20, borderWidth: 1, padding: 20 },
  centerText: { textAlign: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: "800" },
  close: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
