import type { EmailCard, RiskLevel } from "@replydeck/shared";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { ActionButton } from "./ActionButton";
import { Pill } from "./Pill";
import { colors } from "../theme/colors";

type ApprovalCardProps = {
  card: EmailCard;
  onSend: () => void;
  onEdit: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  onLater: () => void;
};

const riskTone: Record<RiskLevel, "green" | "amber" | "red"> = {
  low: "green",
  medium: "amber",
  high: "red"
};

export function ApprovalCard({
  card,
  onSend,
  onEdit,
  onReject,
  onRegenerate,
  onLater
}: ApprovalCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {card.fromName
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)}
          </Text>
        </View>
        <View style={styles.senderBlock}>
          <Text style={styles.sender}>{card.fromName}</Text>
          <Text style={styles.email}>{card.fromEmail}</Text>
        </View>
        <Pill label={card.riskLevel} tone={riskTone[card.riskLevel]} />
      </View>

      <Text style={styles.subject}>{card.subject}</Text>
      <Text style={styles.time}>{formatReceivedAt(card.receivedAt)}</Text>

      <View style={styles.metricRow}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{card.confidenceScore}%</Text>
          <Text style={styles.metricLabel}>Confidence</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricText}>
          <Text style={styles.riskReason}>{card.riskReason}</Text>
        </View>
      </View>

      <Section title="Summary" body={card.summary} />
      <Section title="Sender intent" body={card.senderIntent} />

      <View style={styles.contextBlock}>
        <Text style={styles.sectionTitle}>Context used</Text>
        {card.contextUsed.map((item) => (
          <View key={item} style={styles.contextItem}>
            <Ionicons name="checkmark-circle" size={15} color={colors.gold} />
            <Text style={styles.contextText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.draftBox}>
        <View style={styles.draftHeader}>
          <Text style={styles.sectionTitle}>AI draft</Text>
          <Pill
            label={card.status === "edited" ? "Edited" : "Ready"}
            tone={card.status === "edited" ? "blue" : "gold"}
          />
        </View>
        <Text style={styles.draftText}>{card.draftReply}</Text>
      </View>

      <View style={styles.primaryActions}>
        <ActionButton
          label="Send"
          icon="paper-plane"
          tone="primary"
          onPress={onSend}
          flex
        />
        <ActionButton label="Edit" icon="create-outline" onPress={onEdit} flex />
      </View>
      <View style={styles.secondaryActions}>
        <ActionButton
          label="Reject"
          icon="close-circle-outline"
          tone="danger"
          onPress={onReject}
          flex
        />
        <ActionButton
          label="Regenerate"
          icon="sparkles-outline"
          onPress={onRegenerate}
          flex
        />
        <ActionButton
          label="Later"
          icon="time-outline"
          tone="quiet"
          onPress={onLater}
          flex
        />
      </View>
    </View>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

function formatReceivedAt(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#090805",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 28
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.goldSoft,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  avatarText: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: "900"
  },
  senderBlock: {
    flex: 1
  },
  sender: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  email: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2
  },
  subject: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 29,
    marginTop: 18
  },
  time: {
    color: colors.textSubtle,
    fontSize: 12,
    marginTop: 7
  },
  metricRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderRadius: 22,
    flexDirection: "row",
    gap: 14,
    marginTop: 18,
    padding: 14
  },
  metric: {
    width: 88
  },
  metricValue: {
    color: colors.gold,
    fontSize: 25,
    fontWeight: "900"
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2
  },
  metricDivider: {
    backgroundColor: colors.border,
    height: 45,
    width: 1
  },
  metricText: {
    flex: 1
  },
  riskReason: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  section: {
    marginTop: 18
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 7,
    textTransform: "uppercase"
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22
  },
  contextBlock: {
    marginTop: 18
  },
  contextItem: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  contextText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 13,
    lineHeight: 18
  },
  draftBox: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 20,
    padding: 16
  },
  draftHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  draftText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 6
  },
  primaryActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18
  },
  secondaryActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  }
});
