import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { ScreenShell } from "../components/ScreenShell";
import { TopBar } from "../components/TopBar";
import { colors } from "../theme/colors";

type SecurityScreenProps = {
  onBack: () => void;
};

export function SecurityScreen({ onBack }: SecurityScreenProps) {
  return (
    <ScreenShell>
      <TopBar title="Security" subtitle="Trust rules" onBack={onBack} />
      <View style={styles.hero}>
        <Ionicons name="shield-checkmark" size={34} color={colors.green} />
        <Text style={styles.title}>Human approval stays mandatory.</Text>
        <Text style={styles.body}>
          The fake demo mirrors the security posture for the real Outlook build.
        </Text>
      </View>

      <View style={styles.rules}>
        <Rule title="Microsoft OAuth only" detail="ReplyDeck never asks for email passwords." />
        <Rule title="Encrypted tokens" detail="Access and refresh tokens must be encrypted at rest." />
        <Rule title="No silent sending" detail="Drafts are suggestions until the user approves them." />
        <Rule title="Minimal storage" detail="No attachments are stored in the MVP." />
        <Rule title="Visible context" detail="Each card shows what context the AI used." />
        <Rule title="Data controls" detail="Users can disconnect Outlook and delete stored data." />
        <Rule
          title="Home screen restriction"
          detail="Send is available only for low risk, high confidence cards."
        />
      </View>
    </ScreenShell>
  );
}

function Rule({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.rule}>
      <View style={styles.ruleIcon}>
        <Ionicons name="checkmark" size={16} color={colors.gold} />
      </View>
      <View style={styles.ruleText}>
        <Text style={styles.ruleTitle}>{title}</Text>
        <Text style={styles.ruleDetail}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    padding: 20
  },
  title: {
    color: colors.text,
    fontSize: 27,
    fontWeight: "900",
    lineHeight: 32,
    marginTop: 16
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10
  },
  rules: {
    gap: 10,
    marginTop: 16
  },
  rule: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 15
  },
  ruleIcon: {
    alignItems: "center",
    backgroundColor: colors.goldSoft,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  ruleText: {
    flex: 1
  },
  ruleTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  ruleDetail: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4
  }
});
