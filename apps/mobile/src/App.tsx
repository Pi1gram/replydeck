import type { EmailCard } from "@replydeck/shared";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  approveCard as apiApproveCard,
  editReply as apiEditReply,
  laterCard as apiLaterCard,
  listCards,
  regenerateCard as apiRegenerateCard,
  rejectCard as apiRejectCard
} from "./api/emailCards";
import { ConnectOutlookScreen } from "./screens/ConnectOutlookScreen";
import { EditDraftScreen } from "./screens/EditDraftScreen";
import { LaterScreen } from "./screens/LaterScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { QueueScreen } from "./screens/QueueScreen";
import { SecurityScreen } from "./screens/SecurityScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { colors } from "./theme/colors";

type Screen =
  | { name: "onboarding" }
  | { name: "connect" }
  | { name: "queue" }
  | { name: "edit"; card: EmailCard }
  | { name: "later" }
  | { name: "settings" }
  | { name: "security" };

type Counts = {
  sent: number;
  rejected: number;
};

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "onboarding" });
  const [pendingCards, setPendingCards] = useState<EmailCard[]>([]);
  const [laterCards, setLaterCards] = useState<EmailCard[]>([]);
  const [counts, setCounts] = useState<Counts>({ sent: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reportError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    setError(message);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [pending, edited, later, sent, rejected] = await Promise.all([
        listCards("pending"),
        listCards("edited"),
        listCards("later"),
        listCards("sent"),
        listCards("rejected")
      ]);
      setPendingCards([...pending, ...edited]);
      setLaterCards(later);
      setCounts({ sent: sent.length, rejected: rejected.length });
    } catch (err) {
      reportError(err);
      throw err;
    }
  }, [reportError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refreshAll();
      } catch {
        // error already captured by refreshAll
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshAll]);

  async function sendCard(id: string) {
    try {
      await apiApproveCard(id);
      await refreshAll();
    } catch (err) {
      reportError(err);
    }
  }

  async function rejectCard(id: string) {
    try {
      await apiRejectCard(id);
      await refreshAll();
    } catch (err) {
      reportError(err);
    }
  }

  async function laterCard(id: string) {
    try {
      await apiLaterCard(id);
      await refreshAll();
    } catch (err) {
      reportError(err);
    }
  }

  function restoreCard(_id: string) {
    Alert.alert(
      "Restore from Later",
      "Restore from Later is coming in Phase 3."
    );
  }

  async function regenerateCard(id: string) {
    try {
      await apiRegenerateCard(id);
      await refreshAll();
    } catch (err) {
      reportError(err);
    }
  }

  async function saveEdit(id: string, draftReply: string) {
    try {
      await apiEditReply(id, draftReply);
      await refreshAll();
      setScreen({ name: "queue" });
    } catch (err) {
      reportError(err);
    }
  }

  const showQueueChrome = useMemo(
    () => screen.name === "queue",
    [screen.name]
  );

  return (
    <SafeAreaProvider style={styles.provider}>
      <StatusBar style="light" />
      {error && showQueueChrome ? (
        <Pressable
          style={styles.errorBanner}
          onPress={() => setError(null)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss error"
        >
          <Text style={styles.errorText} numberOfLines={2}>
            {error} (tap to dismiss)
          </Text>
        </Pressable>
      ) : null}

      {screen.name === "onboarding" ? (
        <OnboardingScreen onContinue={() => setScreen({ name: "connect" })} />
      ) : null}
      {screen.name === "connect" ? (
        <ConnectOutlookScreen onContinue={() => setScreen({ name: "queue" })} />
      ) : null}
      {screen.name === "queue" ? (
        loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.gold} />
            <Text style={styles.loadingText}>Loading queue…</Text>
          </View>
        ) : (
          <QueueScreen
            cards={pendingCards}
            laterCount={laterCards.length}
            sentCount={counts.sent}
            rejectedCount={counts.rejected}
            onSend={sendCard}
            onEdit={(card) => setScreen({ name: "edit", card })}
            onReject={rejectCard}
            onRegenerate={regenerateCard}
            onLater={laterCard}
            onOpenLater={() => setScreen({ name: "later" })}
            onOpenSettings={() => setScreen({ name: "settings" })}
          />
        )
      ) : null}
      {screen.name === "edit" ? (
        <EditDraftScreen
          card={screen.card}
          onCancel={() => setScreen({ name: "queue" })}
          onSave={saveEdit}
        />
      ) : null}
      {screen.name === "later" ? (
        <LaterScreen
          cards={laterCards}
          onBack={() => setScreen({ name: "queue" })}
          onRestore={restoreCard}
        />
      ) : null}
      {screen.name === "settings" ? (
        <SettingsScreen
          onBack={() => setScreen({ name: "queue" })}
          onSecurity={() => setScreen({ name: "security" })}
          onSyncedReturnToQueue={async () => {
            await refreshAll();
            setScreen({ name: "queue" });
          }}
        />
      ) : null}
      {screen.name === "security" ? (
        <SecurityScreen onBack={() => setScreen({ name: "settings" })} />
      ) : null}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  provider: {
    flex: 1
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 12
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 15
  },
  errorBanner: {
    backgroundColor: colors.redSoft,
    borderBottomColor: colors.red,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 10
  },
  errorText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600"
  }
});
