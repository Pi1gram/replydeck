import type { EmailCard } from "@replydeck/shared";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ApprovalCard } from "../components/ApprovalCard";
import { HomeWidgetPreview } from "../components/HomeWidgetPreview";
import { ScreenShell } from "../components/ScreenShell";
import { TopBar } from "../components/TopBar";
import { colors } from "../theme/colors";

type QueueScreenProps = {
  cards: EmailCard[];
  laterCount: number;
  sentCount: number;
  rejectedCount: number;
  onSend: (id: string) => void;
  onEdit: (card: EmailCard) => void;
  onReject: (id: string) => void;
  onRegenerate: (id: string) => void;
  onLater: (id: string) => void;
  onOpenLater: () => void;
  onOpenSettings: () => void;
};

export function QueueScreen({
  cards,
  laterCount,
  sentCount,
  rejectedCount,
  onSend,
  onEdit,
  onReject,
  onRegenerate,
  onLater,
  onOpenLater,
  onOpenSettings
}: QueueScreenProps) {
  const activeCard = cards[0];

  return (
    <ScreenShell>
      <TopBar
        title="Approval queue"
        subtitle={`${cards.length} pending`}
        rightLabel="Settings"
        onRightPress={onOpenSettings}
      />

      <View style={styles.stats}>
        <Stat label="Sent" value={sentCount} />
        <Stat label="Later" value={laterCount} />
        <Stat label="Rejected" value={rejectedCount} />
      </View>

      <HomeWidgetPreview
        card={activeCard}
        onSend={() => activeCard && onSend(activeCard.id)}
        onLater={() => activeCard && onLater(activeCard.id)}
        onOpen={() => undefined}
      />

      {activeCard ? (
        <ApprovalCard
          card={activeCard}
          onSend={() => onSend(activeCard.id)}
          onEdit={() => onEdit(activeCard)}
          onReject={() => onReject(activeCard.id)}
          onRegenerate={() => onRegenerate(activeCard.id)}
          onLater={() => onLater(activeCard.id)}
        />
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-done-circle" size={44} color={colors.green} />
          <Text style={styles.emptyTitle}>Queue clear</Text>
          <Text style={styles.emptyBody}>
            Every fake card has been handled. Saved cards are still available in
            Later.
          </Text>
        </View>
      )}

      <Pressable style={styles.laterLink} onPress={onOpenLater}>
        <Ionicons name="file-tray-outline" size={17} color={colors.gold} />
        <Text style={styles.laterText}>Open Later queue</Text>
      </Pressable>
    </ScreenShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16
  },
  stat: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    padding: 13
  },
  statValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900"
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    padding: 28
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 14
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center"
  },
  laterLink: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 20,
    padding: 10
  },
  laterText: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: "800"
  }
});
