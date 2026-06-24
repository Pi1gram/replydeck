import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  createSenderProfile,
  deleteSenderProfile,
  listSenderProfiles,
  SenderProfile,
  ToneId,
  updateSenderProfile
} from "../api/settings";
import { ErrorBanner } from "../components/ErrorBanner";
import { ScreenShell } from "../components/ScreenShell";
import { TopBar } from "../components/TopBar";
import { colors } from "../theme/colors";

type SenderProfilesScreenProps = {
  onBack: () => void;
};

const TONE_OPTIONS: Array<{ id: ToneId; label: string }> = [
  { id: "formal", label: "Formal" },
  { id: "business", label: "Business" },
  { id: "friends", label: "Friends" }
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SenderProfilesScreen({ onBack }: SenderProfilesScreenProps) {
  const [profiles, setProfiles] = useState<SenderProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const dismissError = useCallback(() => setError(null), []);

  const refresh = useCallback(async () => {
    try {
      const list = await listSenderProfiles();
      setProfiles(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await listSenderProfiles();
        if (!cancelled) setProfiles(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function togglePin(profile: SenderProfile) {
    if (busyEmail) return;
    setBusyEmail(profile.senderEmail);
    setError(null);
    try {
      const next = await updateSenderProfile(profile.senderEmail, {
        pinAlwaysReview: !profile.pinAlwaysReview
      });
      setProfiles((list) =>
        list.map((p) => (p.senderEmail === next.senderEmail ? next : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyEmail(null);
    }
  }

  function confirmDelete(profile: SenderProfile) {
    Alert.alert(
      "Remove override?",
      `Stop using a custom profile for ${profile.senderEmail}? The AI will fall back to your default tone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void performDelete(profile.senderEmail);
          }
        }
      ]
    );
  }

  async function performDelete(email: string) {
    if (busyEmail) return;
    setBusyEmail(email);
    setError(null);
    try {
      await deleteSenderProfile(email);
      setProfiles((list) => list.filter((p) => p.senderEmail !== email));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyEmail(null);
    }
  }

  async function handleCreate(input: {
    senderEmail: string;
    preferredTone: ToneId | null;
    pinAlwaysReview: boolean;
    notes: string[];
  }) {
    setError(null);
    try {
      await createSenderProfile(input);
      setAddOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  return (
    <>
      {error ? <ErrorBanner message={error} onDismiss={dismissError} /> : null}
      <ScreenShell scroll={false}>
        <TopBar
          title="Sender overrides"
          subtitle="Per-sender tone"
          onBack={onBack}
          rightLabel="+ Add"
          onRightPress={() => setAddOpen(true)}
        />

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.gold} />
            <Text style={styles.loadingText}>Loading overrides…</Text>
          </View>
        ) : profiles.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={36} color={colors.gold} />
            <Text style={styles.emptyTitle}>No overrides yet.</Text>
            <Text style={styles.emptyBody}>
              The AI uses your default tone for every sender.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.emptyCta,
                pressed && styles.btnPressed
              ]}
              onPress={() => setAddOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Add sender override"
            >
              <Ionicons name="add" size={18} color={colors.background} />
              <Text style={styles.emptyCtaText}>Add sender</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={profiles}
            keyExtractor={(item) => item.senderEmail}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <SenderRow
                profile={item}
                busy={busyEmail === item.senderEmail}
                onTogglePin={() => togglePin(item)}
                onDelete={() => confirmDelete(item)}
              />
            )}
          />
        )}
      </ScreenShell>

      <AddSenderModal
        visible={addOpen}
        onDismiss={() => setAddOpen(false)}
        onCreate={handleCreate}
      />
    </>
  );
}

function SenderRow({
  profile,
  busy,
  onTogglePin,
  onDelete
}: {
  profile: SenderProfile;
  busy: boolean;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const summary = describeProfile(profile);

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowEmail} numberOfLines={1}>
            {profile.senderEmail}
          </Text>
          {profile.pinAlwaysReview ? (
            <View style={styles.pinBadge}>
              <Ionicons name="pin" size={11} color={colors.gold} />
              <Text style={styles.pinBadgeText}>Pinned</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowSummary} numberOfLines={2}>
          {summary}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <Pressable
          onPress={onTogglePin}
          disabled={busy}
          style={({ pressed }) => [
            styles.pinBtn,
            profile.pinAlwaysReview && styles.pinBtnActive,
            pressed && !busy && styles.btnPressed,
            busy && styles.btnDisabled
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            profile.pinAlwaysReview
              ? `Unpin ${profile.senderEmail}`
              : `Pin ${profile.senderEmail}`
          }
        >
          <Text
            style={[
              styles.pinBtnText,
              profile.pinAlwaysReview && styles.pinBtnTextActive
            ]}
          >
            {profile.pinAlwaysReview ? "Unpin" : "Pin"}
          </Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          disabled={busy}
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed && !busy && styles.btnPressed,
            busy && styles.btnDisabled
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Delete override for ${profile.senderEmail}`}
        >
          <Ionicons name="trash-outline" size={16} color={colors.red} />
        </Pressable>
      </View>
    </View>
  );
}

function describeProfile(profile: SenderProfile): string {
  const parts: string[] = [];
  if (profile.relationship) parts.push(profile.relationship);
  if (profile.preferredTone) parts.push(`${profile.preferredTone} tone`);
  if (profile.usualReplyLength) parts.push(profile.usualReplyLength);
  if (parts.length === 0) return "No extra rules — default tone.";
  return parts.join(" • ");
}

function AddSenderModal({
  visible,
  onDismiss,
  onCreate
}: {
  visible: boolean;
  onDismiss: () => void;
  onCreate: (input: {
    senderEmail: string;
    preferredTone: ToneId | null;
    pinAlwaysReview: boolean;
    notes: string[];
  }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [tone, setTone] = useState<ToneId | null>(null);
  const [pin, setPin] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      // Reset when the modal closes.
      setEmail("");
      setTone(null);
      setPin(false);
      setNotes("");
      setSubmitting(false);
      setLocalError(null);
    }
  }, [visible]);

  const emailValid = EMAIL_PATTERN.test(email.trim());

  async function handleSubmit() {
    if (submitting) return;
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setLocalError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setLocalError(null);
    try {
      const noteLines = notes
        .split("\n")
        .map((n) => n.trim())
        .filter((n) => n.length > 0);
      await onCreate({
        senderEmail: trimmed,
        preferredTone: tone,
        pinAlwaysReview: pin,
        notes: noteLines
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.modalSafe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={styles.modalFlex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable
              onPress={onDismiss}
              style={styles.modalClose}
              accessibilityRole="button"
              accessibilityLabel="Close add sender"
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.modalTitle}>Add sender override</Text>
            <View style={styles.modalClosePlaceholder} />
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Email *</Text>
            <TextInput
              style={styles.fieldInput}
              value={email}
              onChangeText={setEmail}
              placeholder="someone@example.com"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />

            <Text style={styles.fieldLabel}>Preferred tone</Text>
            <View style={styles.segmented}>
              {TONE_OPTIONS.map((opt) => {
                const active = opt.id === tone;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setTone(active ? null : opt.id)}
                    style={[styles.segment, active && styles.segmentActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`${opt.label} tone`}
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        active && styles.segmentTextActive
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldHint}>
              Tap an option again to clear it.
            </Text>

            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleTitle}>Pin: always review</Text>
                <Text style={styles.toggleHint}>
                  Force this sender's drafts to wait for your approval.
                </Text>
              </View>
              <Pressable
                onPress={() => setPin((v) => !v)}
                style={[styles.toggleSwitch, pin && styles.toggleSwitchOn]}
                accessibilityRole="switch"
                accessibilityState={{ checked: pin }}
                accessibilityLabel="Pin always review"
              >
                <View
                  style={[styles.toggleKnob, pin && styles.toggleKnobOn]}
                />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMulti]}
              value={notes}
              onChangeText={setNotes}
              placeholder="One note per line"
              placeholderTextColor={colors.textSubtle}
              multiline
              textAlignVertical="top"
            />

            {localError ? (
              <Text style={styles.modalError}>{localError}</Text>
            ) : null}
          </View>

          <View style={styles.modalFooter}>
            <Pressable
              onPress={handleSubmit}
              disabled={!emailValid || submitting}
              style={({ pressed }) => [
                styles.submitBtn,
                (!emailValid || submitting) && styles.btnDisabled,
                pressed && emailValid && !submitting && styles.btnPressed
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save sender override"
            >
              {submitting ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.submitBtnText}>Save override</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 60
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    padding: 28
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 6
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  emptyCta: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 11
  },
  emptyCtaText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: "800"
  },
  listContent: {
    paddingBottom: 24
  },
  separator: {
    height: 10
  },
  row: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  rowMain: {
    flex: 1,
    gap: 4
  },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  rowEmail: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "800"
  },
  pinBadge: {
    alignItems: "center",
    backgroundColor: colors.goldSoft,
    borderRadius: 10,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  pinBadgeText: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  rowSummary: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  rowActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  pinBtn: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  pinBtnActive: {
    backgroundColor: colors.goldSoft,
    borderColor: colors.gold
  },
  pinBtnText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700"
  },
  pinBtnTextActive: {
    color: colors.gold
  },
  deleteBtn: {
    alignItems: "center",
    backgroundColor: colors.redSoft,
    borderColor: colors.red,
    borderRadius: 12,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  btnPressed: {
    opacity: 0.85
  },
  btnDisabled: {
    opacity: 0.5
  },
  modalSafe: {
    backgroundColor: colors.background,
    flex: 1
  },
  modalFlex: {
    flex: 1
  },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  modalClose: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36
  },
  modalClosePlaceholder: {
    height: 36,
    width: 36
  },
  modalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  modalBody: {
    flex: 1,
    padding: 20
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 12,
    textTransform: "uppercase"
  },
  fieldInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  fieldInputMulti: {
    minHeight: 90
  },
  fieldHint: {
    color: colors.textSubtle,
    fontSize: 12,
    marginTop: 6
  },
  segmented: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    padding: 4
  },
  segment: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    paddingVertical: 9
  },
  segmentActive: {
    backgroundColor: colors.gold
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700"
  },
  segmentTextActive: {
    color: colors.background,
    fontWeight: "800"
  },
  toggleRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
    padding: 14
  },
  toggleText: {
    flex: 1
  },
  toggleTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  toggleHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },
  toggleSwitch: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    padding: 3,
    width: 50
  },
  toggleSwitchOn: {
    backgroundColor: colors.gold
  },
  toggleKnob: {
    backgroundColor: colors.text,
    borderRadius: 11,
    height: 22,
    width: 22
  },
  toggleKnobOn: {
    backgroundColor: colors.background,
    transform: [{ translateX: 22 }]
  },
  modalError: {
    color: colors.red,
    fontSize: 13,
    marginTop: 16
  },
  modalFooter: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: 16
  },
  submitBtn: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 50,
    paddingVertical: 14
  },
  submitBtnText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: "800"
  }
});
