import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenShell } from "../components/ScreenShell";
import { colors } from "../theme/colors";

type ConnectOutlookScreenProps = {
  onContinue: () => void;
};

export function ConnectOutlookScreen({ onContinue }: ConnectOutlookScreenProps) {
  return (
    <ScreenShell scroll={false}>
      <View style={styles.content}>
        <View style={styles.panel}>
          <View style={styles.microsoftTile}>
            <Ionicons name="logo-microsoft" size={30} color={colors.blue} />
          </View>
          <Text style={styles.title}>Outlook connection</Text>
          <Text style={styles.body}>
            Phase 1 uses fake cards only. The real product will use Microsoft
            OAuth, encrypted tokens, and no email passwords.
          </Text>
          <View style={styles.rules}>
            <Rule text="No autonomous sending" />
            <Rule text="No attachments stored in MVP" />
            <Rule text="Disconnect and delete data controls planned" />
          </View>
        </View>
      </View>

      <Pressable style={styles.button} onPress={onContinue}>
        <Text style={styles.buttonText}>Use fake queue</Text>
        <Ionicons name="albums-outline" size={18} color={colors.background} />
      </Pressable>
    </ScreenShell>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <View style={styles.rule}>
      <Ionicons name="checkmark-circle" size={17} color={colors.green} />
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "center"
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 30,
    borderWidth: 1,
    padding: 22
  },
  microsoftTile: {
    alignItems: "center",
    backgroundColor: colors.blueSoft,
    borderRadius: 23,
    height: 56,
    justifyContent: "center",
    marginBottom: 22,
    width: 56
  },
  title: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "900",
    lineHeight: 36
  },
  body: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 14
  },
  rules: {
    gap: 12,
    marginTop: 24
  },
  rule: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  ruleText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "700"
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
