import type { EmailCard } from "@replydeck/shared";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Pill } from "../components/Pill";
import { ScreenShell } from "../components/ScreenShell";
import { TopBar } from "../components/TopBar";
import { colors } from "../theme/colors";

type LaterScreenProps = {
  cards: EmailCard[];
  onBack: () => void;
  onRestore: (id: string) => void;
};

export function LaterScreen({ cards, onBack, onRestore }: LaterScreenProps) {
  return (
    <ScreenShell>
      <TopBar title="Later" subtitle={`${cards.length} saved`} onBack={onBack} />
      {cards.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="file-tray-outline" size={38} color={colors.textSubtle} />
          <Text style={styles.emptyTitle}>Nothing saved</Text>
          <Text style={styles.emptyBody}>
            Tap Later on a card to move it here without sending or rejecting.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {cards.map((card) => (
            <View key={card.id} style={styles.item}>
              <View style={styles.itemHeader}>
                <View style={styles.itemTitle}>
                  <Text style={styles.sender}>{card.fromName}</Text>
                  <Text style={styles.subject}>{card.subject}</Text>
                </View>
                <Pill
                  label={card.riskLevel}
                  tone={
                    card.riskLevel === "low"
                      ? "green"
                      : card.riskLevel === "medium"
                        ? "amber"
                        : "red"
                  }
                />
              </View>
              <Text style={styles.summary}>{card.summary}</Text>
              <Pressable style={styles.restoreButton} onPress={() => onRestore(card.id)}>
                <Ionicons name="return-down-back" size={16} color={colors.gold} />
                <Text style={styles.restoreLabel}>Return to queue</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 26,
    borderWidth: 1,
    padding: 28
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 12
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: "center"
  },
  list: {
    gap: 12
  },
  item: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16
  },
  itemHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  itemTitle: {
    flex: 1
  },
  sender: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  subject: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 3
  },
  summary: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12
  },
  restoreButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    marginTop: 14,
    paddingVertical: 4
  },
  restoreLabel: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "800"
  }
});
