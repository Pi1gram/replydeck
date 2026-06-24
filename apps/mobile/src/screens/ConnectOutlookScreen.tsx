import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { microsoftStartUrl } from "../api/outlook";
import { ScreenShell } from "../components/ScreenShell";
import { colors } from "../theme/colors";

type ConnectOutlookScreenProps = {
  onContinue: () => void;
};

export function ConnectOutlookScreen({
  onContinue
}: ConnectOutlookScreenProps) {
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      const url = microsoftStartUrl();
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Open this URL on your laptop", url);
        return;
      }
      await Linking.openURL(url);
      Alert.alert(
        "Finish signing in",
        "Complete Microsoft sign-in in your browser, then return to ReplyDeck and tap Continue. You can sync your inbox from Settings."
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert("Couldn't open Microsoft sign-in", message);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <ScreenShell scroll={false}>
      <View style={styles.content}>
        <View style={styles.panel}>
          <View style={styles.microsoftTile}>
            <Ionicons name="logo-microsoft" size={30} color={colors.blue} />
          </View>
          <Text style={styles.title}>Connect your Outlook</Text>
          <Text style={styles.body}>
            ReplyDeck signs in through Microsoft OAuth — no passwords ever
            touch us. Tokens are encrypted at rest and you can disconnect
            from Settings any time.
          </Text>
          <View style={styles.rules}>
            <Rule text="Encrypted tokens · no password ever" />
            <Rule text="Nothing sends without your tap" />
            <Rule text="Disconnect + delete data any time" />
          </View>
        </View>
      </View>

      <Pressable
        style={[styles.button, connecting && styles.buttonDisabled]}
        onPress={handleConnect}
        disabled={connecting}
        accessibilityRole="button"
        accessibilityLabel="Connect Outlook"
      >
        {connecting ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Ionicons name="logo-microsoft" size={18} color={colors.background} />
        )}
        <Text style={styles.buttonText}>
          {connecting ? "Opening Microsoft…" : "Connect Outlook"}
        </Text>
      </Pressable>

      <Pressable style={styles.secondary} onPress={onContinue}>
        <Text style={styles.secondaryText}>Skip — explore sample queue</Text>
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
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: "900"
  },
  secondary: {
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 10
  },
  secondaryText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700"
  }
});
