import React, { useState } from "react";
import { View, TextInput, Text, StyleSheet, Pressable } from "react-native";
import type {
  TextInput as RNTextInput,
  TextInputProps,
  TextStyle,
  NativeSyntheticEvent,
  TargetedEvent,
} from "react-native";
import { useTheme } from "@/theme/useTheme";

interface Props {
  label?: string;
  // Optional label/input style overrides (e.g. RTL alignment). Inert:
  // defaults preserve the exact previous rendering.
  labelStyle?: TextStyle;
  inputStyle?: TextStyle;
  // Optional password-toggle captions (default "Show"/"Hide"). Inert.
  showLabel?: string;
  hideLabel?: string;
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

  inputRef?: React.Ref<RNTextInput>;

  returnKeyType?: TextInputProps["returnKeyType"];
  blurOnSubmit?: TextInputProps["blurOnSubmit"];
  submitBehavior?: TextInputProps["submitBehavior"];
  onSubmitEditing?: () => void;

  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  importantForAutofill?: TextInputProps["importantForAutofill"];

  onFocus?: (e: NativeSyntheticEvent<TargetedEvent>) => void;
  onBlur?: (e: NativeSyntheticEvent<TargetedEvent>) => void;
}

export function Input({
  label,
  labelStyle,
  inputStyle,
  showLabel = "Show",
  hideLabel = "Hide",
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = "none",
  autoCorrect = false,
  error,
  editable = true,
  multiline,
  numberOfLines,
  keyboardType,
  maxLength,
  inputRef,
  returnKeyType,
  blurOnSubmit,
  submitBehavior,
  onSubmitEditing,
  autoComplete,
  textContentType,
  importantForAutofill,
  onFocus,
  onBlur,
}: Props) {
  const { theme } = useTheme();

  // Only controls password visibility.
  // IMPORTANT: there is intentionally NO local focus state.
  const [show, setShow] = useState(false);

  const isSecure = Boolean(secureTextEntry && !show);

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text
          style={[
            styles.label,
            {
              color: theme.colors.textSecondary,
            },
            labelStyle,
          ]}
        >
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: theme.colors.inputBackground,
            borderColor: error
              ? theme.colors.error
              : theme.colors.inputBorder,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              color: theme.colors.text,
            },
            inputStyle,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.inputPlaceholder}
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
          submitBehavior={submitBehavior}
          onSubmitEditing={
            onSubmitEditing
              ? () => {
                  onSubmitEditing();
                }
              : undefined
          }
          autoComplete={autoComplete}
          textContentType={textContentType}
          importantForAutofill={importantForAutofill}
          onFocus={onFocus}
          onBlur={onBlur}
        />

        {secureTextEntry ? (
          <Pressable
            onPress={() => setShow((current) => !current)}
            style={styles.showBtn}
            hitSlop={8}
          >
            <Text
              style={[
                styles.showText,
                {
                  color: theme.colors.primary,
                },
              ]}
            >
              {show ? hideLabel : showLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text
          style={[
            styles.error,
            {
              color: theme.colors.error,
            },
          ]}
        >
          {error}
        </Text>
      ) : null}
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
  wrap: {
    marginBottom: 12,
  },

  label: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
  },

  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
  },

  error: {
    marginTop: 6,
    fontSize: 12,
  },

  showBtn: {
    marginLeft: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },

  showText: {
    fontWeight: "600",
    fontSize: 13,
  },
});