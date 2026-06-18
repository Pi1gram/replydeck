import type { EmailCard } from "@replydeck/shared";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useState } from "react";

import { ActionButton } from "../components/ActionButton";
import { Pill } from "../components/Pill";
import { ScreenShell } from "../components/ScreenShell";
import { TopBar } from "../components/TopBar";
import { colors } from "../theme/colors";

type EditDraftScreenProps = {
  card: EmailCard;
  onCancel: () => void;
  onSave: (id: string, draftReply: string) => void;
  saving?: boolean;
};

export function EditDraftScreen({
  card,
  onCancel,
  onSave,
  saving = false
}: EditDraftScreenProps) {
  const [draft, setDraft] = useState(card.draftReply);

  return (
    <ScreenShell>
      <TopBar title="Edit draft" subtitle={card.fromName} onBack={onCancel} />

      <View style={styles.context}>
        <Text style={styles.subject}>{card.subject}</Text>
        <View style={styles.metaRow}>
          <Pill label={`${card.confidenceScore}% confidence`} tone="gold" />
          <Pill
            label={`${card.riskLevel} risk`}
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
      </View>

      <Text style={styles.label}>Draft reply</Text>
      <TextInput
        multiline
        value={draft}
        onChangeText={setDraft}
        style={styles.input}
        textAlignVertical="top"
        placeholder="Write a reply"
        placeholderTextColor={colors.textSubtle}
      />

      <View style={styles.actions}>
        <ActionButton
          label="Cancel"
          icon="close-outline"
          onPress={onCancel}
          flex
          disabled={saving}
        />
        <ActionButton
          label="Save edit"
          icon="checkmark"
          tone="primary"
          onPress={() => onSave(card.id, draft)}
          flex
          loading={saving}
          loadingLabel="Saving…"
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  context: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16
  },
  subject: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 27
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  summary: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 22,
    textTransform: "uppercase"
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 260,
    padding: 16
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16
  }
});
