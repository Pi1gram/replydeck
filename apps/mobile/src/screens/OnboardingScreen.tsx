import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenShell } from "../components/ScreenShell";
import { colors } from "../theme/colors";

type OnboardingScreenProps = {
  onContinue: () => void;
};

export function OnboardingScreen({ onContinue }: OnboardingScreenProps) {
  return (
    <ScreenShell scroll={false}>
      <View style={styles.content}>
        <View style={styles.mark}>
          <Ionicons name="mail-unread-outline" size={34} color={colors.gold} />
        </View>
        <Text style={styles.kicker}>ReplyDeck</Text>
        <Text style={styles.title}>Approve Outlook replies from your phone.</Text>
        <Text style={styles.body}>
          AI prepares the reply. You stay in control. Outlook remains the
          source of truth.
        </Text>

        <View style={styles.steps}>
          <Step icon="sparkles-outline" text="AI drafts every reply in your tone" />
          <Step icon="finger-print-outline" text="Approve, edit, or reject with a tap" />
          <Step icon="shield-checkmark-outline" text="Risky emails always wait for review" />
        </View>
      </View>

      <Pressable style={styles.button} onPress={onContinue}>
        <Text style={styles.buttonText}>Get started</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.background} />
      </Pressable>
    </ScreenShell>
  );
}

function Step({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.step}>
      <Ionicons name={icon} size={18} color={colors.gold} />
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "center"
  },
  mark: {
    alignItems: "center",
    backgroundColor: colors.goldSoft,
    borderRadius: 30,
    height: 60,
    justifyContent: "center",
    marginBottom: 26,
    width: 60
  },
  kicker: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 12,
    textTransform: "uppercase"
  },
  title: {
    color: colors.text,
    fontSize: 39,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 44
  },
  body: {
    color: colors.textMuted,
    fontSize: 17,
    lineHeight: 25,
    marginTop: 18
  },
  steps: {
    gap: 13,
    marginTop: 34
  },
  step: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11
  },
  stepText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "600"
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: 22,
    flexDirection: "row",
    gap: 8,
    height: 56,
    justifyContent: "center"
  },
  buttonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: "900"
  }
});
