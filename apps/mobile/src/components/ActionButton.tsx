import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors } from "../theme/colors";

type ActionTone = "primary" | "secondary" | "danger" | "quiet";

const toneStyles: Record<ActionTone, { backgroundColor: string; color: string; borderColor: string }> = {
  primary: {
    backgroundColor: colors.gold,
    color: colors.background,
    borderColor: colors.gold
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderColor: colors.border
  },
  danger: {
    backgroundColor: colors.redSoft,
    color: colors.red,
    borderColor: colors.redSoft
  },
  quiet: {
    backgroundColor: "transparent",
    color: colors.textMuted,
    borderColor: colors.border
  }
};

type ActionButtonProps = {
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  tone?: ActionTone;
  onPress: () => void;
  flex?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
};

export function ActionButton({
  label,
  icon,
  tone = "secondary",
  onPress,
  flex = false,
  loading = false,
  loadingLabel,
  disabled = false
}: ActionButtonProps) {
  const toneStyle = toneStyles[tone];
  const isInactive = loading || disabled;
  const displayLabel = loading && loadingLabel ? loadingLabel : label;
  const accessibilityLabel = loading ? `${label}, in progress` : label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      disabled={isInactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        flex && styles.flex,
        {
          backgroundColor: toneStyle.backgroundColor,
          borderColor: toneStyle.borderColor,
          opacity: isInactive ? (loading ? 0.85 : 0.5) : pressed ? 0.78 : 1
        }
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={toneStyle.color} />
      ) : (
        <Ionicons name={icon} size={17} color={toneStyle.color} />
      )}
      <Text style={[styles.label, { color: toneStyle.color }]} numberOfLines={1}>
        {displayLabel}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  flex: {
    flex: 1
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0
  }
});
