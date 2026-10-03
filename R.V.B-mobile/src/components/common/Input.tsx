import React, { useState } from "react";
import { View, TextInput, Text, StyleSheet, Pressable } from "react-native";
import type { TextInput as RNTextInput } from "react-native";
import { useTheme } from "@/theme/useTheme";

interface Props {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  error?: string | null;
  editable?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  keyboardType?: "default" | "numeric" | "email-address" | "phone-pad";
  maxLength?: number;
  // Explicit focus/submit contract (Android-safe). Previously unforwarded,
  // so both fields ran on implicit IME/native defaults.
  inputRef?: React.Ref<RNTextInput>;
  returnKeyType?: "done" | "go" | "next" | "search" | "send";
  blurOnSubmit?: boolean;
  onSubmitEditing?: () => void;
  autoComplete?: "username" | "current-password" | "off";
  textContentType?: "username" | "password" | "none";
}

export function Input({ label, value, onChangeText, placeholder, secureTextEntry, autoCapitalize = "none", autoCorrect = false, error, editable = true, multiline, numberOfLines, keyboardType, maxLength, inputRef, returnKeyType, blurOnSubmit, onSubmitEditing, autoComplete, textContentType }: Props) {
  const { theme } = useTheme();
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const isSecure = secureTextEntry && !show;
  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          { backgroundColor: theme.colors.inputBackground, borderColor: focused ? theme.colors.primary : theme.colors.inputBorder },
          error ? { borderColor: theme.colors.error } : null,
          focused && !error ? { shadowColor: theme.colors.primaryRing, shadowOpacity: 1, shadowRadius: 4 } : null,
        ]}
      >
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.colors.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          secureTextEntry={isSecure}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          editable={editable}
          multiline={multiline}
          numberOfLines={numberOfLines}
          keyboardType={keyboardType}
          maxLength={maxLength}
          returnKeyType={returnKeyType}
          blurOnSubmit={blurOnSubmit}
          onSubmitEditing={onSubmitEditing ? () => onSubmitEditing() : undefined}
          autoComplete={autoComplete}
          textContentType={textContentType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={theme.colors.inputPlaceholder}
        />
        {secureTextEntry ? (
          <Pressable onPress={() => setShow((s) => !s)} style={styles.showBtn}>
            <Text style={[styles.showText, { color: theme.colors.primary }]}>{show ? "Hide" : "Show"}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text> : null}
    </View>
  );
}

export function TextArea(props: Props) {
  return <Input {...props} multiline numberOfLines={4} />;
}
export function NumberInput(props: Props) {
  return <Input {...props} keyboardType="numeric" />;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 11, fontWeight: "700", marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" },
  inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 44 },
  input: { flex: 1, paddingVertical: 10, fontSize: 13 },
  error: { marginTop: 6, fontSize: 12 },
  showBtn: { marginLeft: 8, paddingVertical: 6, paddingHorizontal: 8 },
  showText: { fontWeight: "600", fontSize: 13 },
});
