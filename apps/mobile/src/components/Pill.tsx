import { StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";

type PillTone = "gold" | "green" | "amber" | "red" | "blue" | "neutral";

const toneStyles: Record<PillTone, { backgroundColor: string; color: string }> = {
  gold: { backgroundColor: colors.goldSoft, color: colors.gold },
  green: { backgroundColor: colors.greenSoft, color: colors.green },
  amber: { backgroundColor: colors.amberSoft, color: colors.amber },
  red: { backgroundColor: colors.redSoft, color: colors.red },
  blue: { backgroundColor: colors.blueSoft, color: colors.blue },
  neutral: { backgroundColor: colors.surfaceSoft, color: colors.textMuted }
};

type PillProps = {
  label: string;
  tone?: PillTone;
};

export function Pill({ label, tone = "neutral" }: PillProps) {
  const toneStyle = toneStyles[tone];

  return (
    <View style={[styles.pill, { backgroundColor: toneStyle.backgroundColor }]}>
      <Text style={[styles.label, { color: toneStyle.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase"
  }
});
