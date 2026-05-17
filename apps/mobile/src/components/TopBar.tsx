import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";

type TopBarProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightLabel?: string;
  onRightPress?: () => void;
};

export function TopBar({
  title,
  subtitle,
  onBack,
  rightLabel,
  onRightPress
}: TopBarProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={styles.iconButton}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {rightLabel && onRightPress ? (
        <Pressable onPress={onRightPress} style={styles.rightButton}>
          <Text style={styles.rightLabel}>{rightLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18
  },
  left: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
    gap: 12
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  titleBlock: {
    flex: 1
  },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: 0
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 3
  },
  rightButton: {
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  rightLabel: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "700"
  }
});
