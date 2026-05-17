import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import {
  AuthMe,
  disconnectOutlook,
  getAuthMe,
  microsoftStartUrl,
  syncOutlook
} from "../api/outlook";
import { ScreenShell } from "../components/ScreenShell";
import { TopBar } from "../components/TopBar";
import { colors } from "../theme/colors";

type SettingsScreenProps = {
  onBack: () => void;
  onSecurity: () => void;
  onSyncedReturnToQueue: () => Promise<void> | void;
};

type SyncFootnote = {
  level: "ok" | "warn" | "err";
  text: string;
};

export function SettingsScreen({
  onBack,
  onSecurity,
  onSyncedReturnToQueue
}: SettingsScreenProps) {
  const [me, setMe] = useState<AuthMe | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [busy, setBusy] = useState<null | "connect" | "sync" | "disconnect">(
    null
  );
  const [footnote, setFootnote] = useState<SyncFootnote | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const next = await getAuthMe();
      setMe(next);
    } catch (err) {
      setFootnote({
        level: "err",
        text: `Couldn't reach API: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const connected = me?.outlook.connected === true;
  const connectedEmail =
    me && me.outlook.connected ? me.outlook.email : null;

  async function handleConnect() {
    setBusy("connect");
    try {
      const url = microsoftStartUrl();
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Open this URL on your laptop", url);
      } else {
        await Linking.openURL(url);
        Alert.alert(
          "Finishing connection",
          "After you finish Microsoft sign-in, return to ReplyDeck and tap Sync inbox now.\n\n" +
            "If your phone browser can't reach the redirect URL, complete sign-in on your laptop browser instead — same auth URL works."
        );
      }
    } catch (err) {
      setFootnote({
        level: "err",
        text: `Connect failed: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleSync() {
    setBusy("sync");
    setFootnote(null);
    try {
      // Refresh status first so we show the right "not connected" message
      // if the user hasn't actually completed OAuth yet.
      await refreshStatus();
      const status = await getAuthMe();
      if (!status.outlook.connected) {
        setFootnote({
          level: "warn",
          text: "Not connected yet. Tap Connect Outlook first."
        });
        return;
      }
      const result = await syncOutlook(20);
      const summary =
        result.created.length === 0
          ? `No new messages (${result.skipped} already synced)`
          : `Synced ${result.created.length} new card${result.created.length === 1 ? "" : "s"}` +
            (result.skipped ? ` (${result.skipped} skipped)` : "");
      setFootnote({ level: "ok", text: summary });
      await onSyncedReturnToQueue();
    } catch (err) {
      setFootnote({
        level: "err",
        text: `Sync failed: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    Alert.alert(
      "Disconnect Outlook?",
      "ReplyDeck will stop syncing and will no longer be able to send replies. Audit logs are preserved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setBusy("disconnect");
            try {
              await disconnectOutlook();
              setFootnote({ level: "ok", text: "Outlook disconnected." });
              await refreshStatus();
            } catch (err) {
              setFootnote({
                level: "err",
                text: `Disconnect failed: ${err instanceof Error ? err.message : String(err)}`
              });
            } finally {
              setBusy(null);
            }
          }
        }
      ]
    );
  }

  return (
    <ScreenShell>
      <TopBar title="Settings" subtitle="Phase 3 — Outlook" onBack={onBack} />

      <View style={styles.statusPanel}>
        <View
          style={[
            styles.statusDot,
            connected ? styles.statusDotOk : styles.statusDotOff
          ]}
        />
        <View style={styles.statusText}>
          <Text style={styles.statusTitle}>
            {statusLoading
              ? "Checking…"
              : connected
                ? "Outlook connected"
                : "Outlook not connected"}
          </Text>
          <Text style={styles.statusDetail}>
            {statusLoading
              ? "…"
              : connected
                ? connectedEmail ?? "Connected"
                : "OAuth + encrypted tokens. Nothing sends without you."}
          </Text>
        </View>
        {statusLoading ? <ActivityIndicator color={colors.gold} /> : null}
      </View>

      {connected ? (
        <>
          <PrimaryButton
            label={busy === "sync" ? "Syncing…" : "Sync inbox now"}
            icon="cloud-download-outline"
            onPress={handleSync}
            disabled={!!busy}
          />
          <SecondaryButton
            label="Disconnect Outlook"
            icon="log-out-outline"
            tone="danger"
            onPress={handleDisconnect}
            disabled={!!busy}
          />
        </>
      ) : (
        <PrimaryButton
          label={busy === "connect" ? "Opening Microsoft…" : "Connect Outlook"}
          icon="logo-microsoft"
          onPress={handleConnect}
          disabled={!!busy}
        />
      )}

      {footnote ? (
        <View
          style={[
            styles.footnote,
            footnote.level === "ok" && styles.footnoteOk,
            footnote.level === "warn" && styles.footnoteWarn,
            footnote.level === "err" && styles.footnoteErr
          ]}
        >
          <Text style={styles.footnoteText}>{footnote.text}</Text>
        </View>
      ) : null}

      <Pressable style={styles.linkRow} onPress={onSecurity}>
        <Ionicons
          name="shield-checkmark-outline"
          size={19}
          color={colors.gold}
        />
        <Text style={styles.linkText}>Security and trust</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      </Pressable>

      <Text style={styles.fineprint}>
        Phase 3: real Outlook replies are sent only when you tap Send on a
        card. No autonomous send. High-risk cards (attachments) are blocked.
      </Text>
    </ScreenShell>
  );
}

function PrimaryButton({
  label,
  icon,
  onPress,
  disabled
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.primaryBtn,
        pressed && !disabled && styles.btnPressed,
        disabled && styles.btnDisabled
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={colors.background} />
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  icon,
  tone = "default",
  onPress,
  disabled
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "default" | "danger";
  onPress: () => void;
  disabled?: boolean;
}) {
  const danger = tone === "danger";
  return (
    <Pressable
      style={({ pressed }) => [
        styles.secondaryBtn,
        danger && styles.secondaryBtnDanger,
        pressed && !disabled && styles.btnPressed,
        disabled && styles.btnDisabled
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={19}
        color={danger ? colors.red : colors.text}
      />
      <Text
        style={[styles.secondaryBtnText, danger && styles.secondaryBtnTextDanger]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  statusPanel: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 16
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  statusDotOk: { backgroundColor: colors.green },
  statusDotOff: { backgroundColor: colors.textSubtle },
  statusText: { flex: 1 },
  statusTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  statusDetail: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  primaryBtn: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginTop: 14,
    paddingVertical: 14
  },
  primaryBtnText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: "800"
  },
  secondaryBtn: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginTop: 10,
    paddingVertical: 13
  },
  secondaryBtnDanger: {
    borderColor: colors.red,
    backgroundColor: colors.redSoft
  },
  secondaryBtnText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  secondaryBtnTextDanger: { color: colors.red },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.5 },
  footnote: {
    borderRadius: 14,
    marginTop: 14,
    padding: 12
  },
  footnoteOk: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.green,
    borderWidth: 1
  },
  footnoteWarn: {
    backgroundColor: colors.amberSoft,
    borderColor: colors.amber,
    borderWidth: 1
  },
  footnoteErr: {
    backgroundColor: colors.redSoft,
    borderColor: colors.red,
    borderWidth: 1
  },
  footnoteText: { color: colors.text, fontSize: 13 },
  linkRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    padding: 14
  },
  linkText: { color: colors.text, flex: 1, fontSize: 15, fontWeight: "700" },
  fineprint: {
    color: colors.textSubtle,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 18,
    textAlign: "center"
  }
});
