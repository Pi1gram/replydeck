import type { EmailCard } from "@replydeck/shared";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";

type HomeWidgetPreviewProps = {
  card?: EmailCard;
  onSend: () => void;
  onLater: () => void;
  onOpen: () => void;
};

export function HomeWidgetPreview({
  card,
  onSend,
  onLater,
  onOpen
}: HomeWidgetPreviewProps) {
  if (!card) {
    return null;
  }

  const canSendFromHome =
    card.riskLevel === "low" && card.confidenceScore >= 90;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Ionicons name="phone-portrait-outline" size={17} color={colors.gold} />
        <Text style={styles.title}>Home screen preview</Text>
      </View>
      <Text style={styles.sender}>{card.fromName}</Text>
      <Text style={styles.summary} numberOfLines={2}>
        {card.summary}
      </Text>
      <View style={styles.actions}>
        <WidgetButton
          label={canSendFromHome ? "Send" : "Review"}
          onPress={canSendFromHome ? onSend : onOpen}
          primary
        />
        <WidgetButton label="Later" onPress={onLater} />
        <WidgetButton label="Open" onPress={onOpen} />
      </View>
    </View>
  );
}

function WidgetButton({
  label,
  onPress,
  primary = false
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.widgetButton, primary && styles.widgetButtonPrimary]}
    >
      <Text style={[styles.widgetLabel, primary && styles.widgetLabelPrimary]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginBottom: 12
  },
  title: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  sender: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  summary: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14
  },
  widgetButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    height: 38,
    justifyContent: "center"
  },
  widgetButtonPrimary: {
    backgroundColor: colors.gold,
    borderColor: colors.gold
  },
  widgetLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800"
  },
  widgetLabelPrimary: {
    color: colors.background
  }
});
