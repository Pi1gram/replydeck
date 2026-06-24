import { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors } from "../theme/colors";

type ErrorBannerProps = {
  message: string;
  onDismiss: () => void;
  autoDismissMs?: number;
};

const GENERIC_MESSAGE = "Something went wrong. Try again.";
const GENERIC_PATTERNS = [
  /^API\s+\d{3}/i,
  /Network request failed/i,
  /fetch failed/i,
  /Failed to fetch/i,
  /TypeError/i,
  /^Unexpected/i
];

function isGenericMessage(message: string): boolean {
  if (!message || message.length === 0) return true;
  return GENERIC_PATTERNS.some((pattern) => pattern.test(message));
}

export function ErrorBanner({
  message,
  onDismiss,
  autoDismissMs = 6000
}: ErrorBannerProps) {
  const generic = isGenericMessage(message);
  const displayMessage = generic ? GENERIC_MESSAGE : message;

  useEffect(() => {
    if (autoDismissMs <= 0) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [message, autoDismissMs, onDismiss]);

  return (
    <Pressable
      style={styles.banner}
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel="Dismiss error"
      accessibilityHint="tap to dismiss"
    >
      <Text style={styles.text} numberOfLines={3}>
        {displayMessage}
      </Text>
      <Text style={styles.hint}>(tap to dismiss)</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.redSoft,
    borderBottomColor: colors.red,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 10
  },
  text: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600"
  },
  hint: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2
  }
});
