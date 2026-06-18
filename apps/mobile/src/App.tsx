import type { EmailCard } from "@replydeck/shared";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { ErrorBanner } from "./components/ErrorBanner";
import { usePushRegistration } from "./hooks/usePushRegistration";
import { registerNotificationCategories } from "./notifications/categories";
import {
  configureForegroundHandler,
  handleNotificationAction
} from "./notifications/handler";
import { ConnectOutlookScreen } from "./screens/ConnectOutlookScreen";
import { EditDraftScreen } from "./screens/EditDraftScreen";
import { LaterScreen } from "./screens/LaterScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { QueueScreen } from "./screens/QueueScreen";
import { SecurityScreen } from "./screens/SecurityScreen";
import { SenderProfilesScreen } from "./screens/SenderProfilesScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ToneSettingsScreen } from "./screens/ToneSettingsScreen";
import { colors } from "./theme/colors";

type Screen =
  | { name: "onboarding" }
  | { name: "connect" }
  | { name: "queue" }
  | { name: "edit"; card: EmailCard }
  | { name: "later" }
  | { name: "settings" }
  | { name: "security" }
  | { name: "tone" }
  | { name: "senderProfiles" };

type Counts = {
  sent: number;
  rejected: number;
};

type InFlightAction =
  | "send"
  | "reject"
  | "later"
  | "regenerate"
  | "save"
  | null;

export default function App() {
  // Register native APNs/FCM push token on app start. Hook is fully guarded
  // against Expo Go / permission denial / unsupported runtimes — it will
  // never throw, so wrapping in try/catch at the call site isn't necessary,
  // but the hook itself internally try/catches every step.
  usePushRegistration();

  const [screen, setScreen] = useState<Screen>({ name: "onboarding" });
  const [pendingCards, setPendingCards] = useState<EmailCard[]>([]);
  const [laterCards, setLaterCards] = useState<EmailCard[]>([]);
  const [counts, setCounts] = useState<Counts>({ sent: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inFlightAction, setInFlightAction] = useState<InFlightAction>(null);

  const reportError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    setError(message);
  }, []);

  const dismissError = useCallback(() => setError(null), []);

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

  // Deep links from the home-screen / lock-screen widget land here. Any
  // replydeck:// URL (the widget uses replydeck://queue) jumps straight to the
  // triage queue, skipping onboarding. Cold-launch + foreground both handled.
  useEffect(() => {
    function handleUrl(url: string | null) {
      if (url && url.startsWith("replydeck://")) {
        setScreen({ name: "queue" });
        // Pull the freshest cards so the queue reflects what the widget showed.
        void refreshAll().catch(() => {});
      }
    }
    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => {});
    const sub = Linking.addEventListener("url", (event) =>
      handleUrl(event.url)
    );
    return () => sub.remove();
  }, [refreshAll]);

  // Wire up actionable push notifications.
  // configureForegroundHandler must be called before any notification can
  // arrive; registerNotificationCategories registers the iOS action button
  // sets that back-end pushes reference via categoryId.
  useEffect(() => {
    configureForegroundHandler();
    void registerNotificationCategories();

    const sub = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const action = response.actionIdentifier;
        const data = response.notification.request.content.data;
        const cardId =
          typeof data?.cardId === "string" ? data.cardId : undefined;

        if (!cardId) return;

        // OPEN (explicit button) or DEFAULT (user tapped the notification
        // body itself) — both should bring the queue into view.
        if (
          action === "OPEN" ||
          action === Notifications.DEFAULT_ACTION_IDENTIFIER
        ) {
          setScreen({ name: "queue" });
          void refreshAll().catch(() => {});
          return;
        }

        // Background actions: SEND or REGENERATE — no app foreground needed.
        try {
          await handleNotificationAction(action, cardId);
          await refreshAll();
        } catch {
          // Errors are non-fatal; the queue will still refresh on next open.
        }
      }
    );

    return () => sub.remove();
  }, [refreshAll]);

  async function runAction(
    action: Exclude<InFlightAction, null>,
    work: () => Promise<void>
  ) {
    if (inFlightAction !== null) return;
    setInFlightAction(action);
    setError(null);
    try {
      await work();
    } catch (err) {
      reportError(err);
    } finally {
      setInFlightAction(null);
    }
  }

  async function sendCard(id: string) {
    await runAction("send", async () => {
      await apiApproveCard(id);
      await refreshAll();
    });
  }

  async function rejectCard(id: string) {
    await runAction("reject", async () => {
      await apiRejectCard(id);
      await refreshAll();
    });
  }

  async function laterCard(id: string) {
    await runAction("later", async () => {
      await apiLaterCard(id);
      await refreshAll();
    });
  }

  function restoreCard(_id: string) {
    Alert.alert(
      "Restore from Later",
      "Restore from Later is coming in Phase 3."
    );
  }

  async function regenerateCard(id: string) {
    await runAction("regenerate", async () => {
      await apiRegenerateCard(id);
      await refreshAll();
    });
  }

  async function saveEdit(id: string, draftReply: string) {
    await runAction("save", async () => {
      await apiEditReply(id, draftReply);
      await refreshAll();
      setScreen({ name: "queue" });
    });
  }

  const showErrorBanner = useMemo(
    () => error !== null && (screen.name === "queue" || screen.name === "edit"),
    [error, screen.name]
  );

  const cardInFlight = useMemo<
    "send" | "reject" | "later" | "regenerate" | null
  >(() => {
    if (
      inFlightAction === "send" ||
      inFlightAction === "reject" ||
      inFlightAction === "later" ||
      inFlightAction === "regenerate"
    ) {
      return inFlightAction;
    }
    return null;
  }, [inFlightAction]);

  return (
    <SafeAreaProvider style={styles.provider}>
      <StatusBar style="light" />
      {showErrorBanner && error ? (
        <ErrorBanner message={error} onDismiss={dismissError} />
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
            inFlightAction={cardInFlight}
          />
        )
      ) : null}
      {screen.name === "edit" ? (
        <EditDraftScreen
          card={screen.card}
          onCancel={() => setScreen({ name: "queue" })}
          onSave={saveEdit}
          saving={inFlightAction === "save"}
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
          onTone={() => setScreen({ name: "tone" })}
          onSenderProfiles={() => setScreen({ name: "senderProfiles" })}
          onSyncedReturnToQueue={async () => {
            await refreshAll();
            setScreen({ name: "queue" });
          }}
        />
      ) : null}
      {screen.name === "security" ? (
        <SecurityScreen onBack={() => setScreen({ name: "settings" })} />
      ) : null}
      {screen.name === "tone" ? (
        <ToneSettingsScreen
          onBack={() => setScreen({ name: "settings" })}
          onSaved={() => setScreen({ name: "settings" })}
        />
      ) : null}
      {screen.name === "senderProfiles" ? (
        <SenderProfilesScreen onBack={() => setScreen({ name: "settings" })} />
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
  }
});
