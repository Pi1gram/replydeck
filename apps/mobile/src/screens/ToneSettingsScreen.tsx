import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import {
  getToneProfile,
  ToneId,
  ToneProfile,
  updateToneProfile
} from "../api/settings";
import { ErrorBanner } from "../components/ErrorBanner";
import { ScreenShell } from "../components/ScreenShell";
import { TopBar } from "../components/TopBar";
import { colors } from "../theme/colors";

type ToneSettingsScreenProps = {
  onBack: () => void;
  onSaved: () => void;
};

type ListKey =
  | "preferredGreetings"
  | "preferredSignOffs"
  | "avoidPhrases"
  | "styleNotes";

const TONE_OPTIONS: Array<{ id: ToneId; label: string; description: string }> = [
  {
    id: "formal",
    label: "Formal",
    description: "Polite, complete, no contractions."
  },
  {
    id: "business",
    label: "Business",
    description: "Direct, concise, no filler."
  },
  {
    id: "friends",
    label: "Friends",
    description: "Casual, contractions fine, short."
  }
];

const DEFAULTS: ToneProfile = {
  defaultTone: "business",
  averageReplyLength: "2-4 sentences",
  preferredGreetings: [],
  preferredSignOffs: [],
  avoidPhrases: [],
  styleNotes: []
};

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function ToneSettingsScreen({
  onBack,
  onSaved
}: ToneSettingsScreenProps) {
  const [initial, setInitial] = useState<ToneProfile>(DEFAULTS);
  const [profile, setProfile] = useState<ToneProfile>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dismissError = useCallback(() => setError(null), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const remote = await getToneProfile();
        if (cancelled) return;
        const next: ToneProfile = remote
          ? {
              defaultTone: remote.defaultTone,
              averageReplyLength:
                remote.averageReplyLength ?? DEFAULTS.averageReplyLength,
              preferredGreetings: remote.preferredGreetings ?? [],
              preferredSignOffs: remote.preferredSignOffs ?? [],
              avoidPhrases: remote.avoidPhrases ?? [],
              styleNotes: remote.styleNotes ?? [],
              createdAt: remote.createdAt,
              updatedAt: remote.updatedAt
            }
          : DEFAULTS;
        setInitial(next);
        setProfile(next);
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

  const dirty =
    profile.defaultTone !== initial.defaultTone ||
    (profile.averageReplyLength ?? "") !== (initial.averageReplyLength ?? "") ||
    !arraysEqual(profile.preferredGreetings, initial.preferredGreetings) ||
    !arraysEqual(profile.preferredSignOffs, initial.preferredSignOffs) ||
    !arraysEqual(profile.avoidPhrases, initial.avoidPhrases) ||
    !arraysEqual(profile.styleNotes, initial.styleNotes);

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await updateToneProfile({
        defaultTone: profile.defaultTone,
        averageReplyLength: profile.averageReplyLength,
        preferredGreetings: profile.preferredGreetings,
        preferredSignOffs: profile.preferredSignOffs,
        avoidPhrases: profile.avoidPhrases,
        styleNotes: profile.styleNotes
      });
      const next: ToneProfile = {
        defaultTone: saved.defaultTone,
        averageReplyLength:
          saved.averageReplyLength ?? profile.averageReplyLength,
        preferredGreetings: saved.preferredGreetings ?? [],
        preferredSignOffs: saved.preferredSignOffs ?? [],
        avoidPhrases: saved.avoidPhrases ?? [],
        styleNotes: saved.styleNotes ?? [],
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt
      };
      setInitial(next);
      setProfile(next);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function selectTone(tone: ToneId) {
    setProfile((p) => ({ ...p, defaultTone: tone }));
  }

  function addItem(key: ListKey, value: string) {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    setProfile((p) => {
      if (p[key].includes(trimmed)) return p;
      return { ...p, [key]: [...p[key], trimmed] };
    });
  }

  function removeItem(key: ListKey, value: string) {
    setProfile((p) => ({
      ...p,
      [key]: p[key].filter((entry) => entry !== value)
    }));
  }

  const activeTone = TONE_OPTIONS.find((t) => t.id === profile.defaultTone);

  if (loading) {
    return (
      <ScreenShell>
        <TopBar title="Tone & voice" subtitle="How AI sounds" onBack={onBack} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.gold} />
          <Text style={styles.loadingText}>Loading tone profile…</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <>
      {error ? <ErrorBanner message={error} onDismiss={dismissError} /> : null}
      <ScreenShell>
        <TopBar title="Tone & voice" subtitle="How AI sounds" onBack={onBack} />

        <Text style={styles.sectionLabel}>Default tone</Text>
        <View style={styles.segmented}>
          {TONE_OPTIONS.map((opt) => {
            const active = opt.id === profile.defaultTone;
            return (
              <Pressable
                key={opt.id}
                onPress={() => selectTone(opt.id)}
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
        {activeTone ? (
          <Text style={styles.toneDescription}>{activeTone.description}</Text>
        ) : null}

        <Text style={styles.sectionLabel}>Average reply length</Text>
        <TextInput
          style={styles.textInput}
          value={profile.averageReplyLength ?? ""}
          onChangeText={(text) =>
            setProfile((p) => ({
              ...p,
              averageReplyLength: text.length === 0 ? null : text
            }))
          }
          placeholder="2-4 sentences"
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <ChipList
          label="Preferred greetings"
          placeholder="e.g. Hi team,"
          values={profile.preferredGreetings}
          onAdd={(v) => addItem("preferredGreetings", v)}
          onRemove={(v) => removeItem("preferredGreetings", v)}
        />
        <ChipList
          label="Preferred sign-offs"
          placeholder="e.g. Thanks,"
          values={profile.preferredSignOffs}
          onAdd={(v) => addItem("preferredSignOffs", v)}
          onRemove={(v) => removeItem("preferredSignOffs", v)}
        />
        <ChipList
          label="Phrases to avoid"
          placeholder="e.g. Just checking in"
          values={profile.avoidPhrases}
          onAdd={(v) => addItem("avoidPhrases", v)}
          onRemove={(v) => removeItem("avoidPhrases", v)}
        />
        <ChipList
          label="Style notes"
          placeholder="e.g. Use bullet points"
          values={profile.styleNotes}
          onAdd={(v) => addItem("styleNotes", v)}
          onRemove={(v) => removeItem("styleNotes", v)}
        />

        <View style={styles.saveBar}>
          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              (!dirty || saving) && styles.saveBtnDisabled,
              pressed && dirty && !saving && styles.btnPressed
            ]}
            onPress={handleSave}
            disabled={!dirty || saving}
            accessibilityRole="button"
            accessibilityLabel="Save tone changes"
          >
            {saving ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <>
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={colors.background}
                />
                <Text style={styles.saveBtnText}>Save changes</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScreenShell>
    </>
  );
}

function ChipList({
  label,
  placeholder,
  values,
  onAdd,
  onRemove
}: {
  label: string;
  placeholder: string;
  values: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    if (draft.trim().length === 0) return;
    onAdd(draft);
    setDraft("");
  }

  return (
    <View style={styles.chipListWrap}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {values.length > 0 ? (
        <View style={styles.chipsRow}>
          {values.map((value) => (
            <View key={value} style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={1}>
                {value}
              </Text>
              <Pressable
                onPress={() => onRemove(value)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${value}`}
              >
                <Ionicons name="close" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={commit}
          returnKeyType="done"
        />
        <Pressable
          onPress={commit}
          style={({ pressed }) => [
            styles.addBtn,
            draft.trim().length === 0 && styles.addBtnDisabled,
            pressed && draft.trim().length > 0 && styles.btnPressed
          ]}
          disabled={draft.trim().length === 0}
          accessibilityRole="button"
          accessibilityLabel={`Add to ${label}`}
        >
          <Ionicons name="add" size={18} color={colors.text} />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
    </View>
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
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase"
  },
  segmented: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    padding: 4
  },
  segment: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    paddingVertical: 10
  },
  segmentActive: {
    backgroundColor: colors.gold
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700"
  },
  segmentTextActive: {
    color: colors.background,
    fontWeight: "800"
  },
  toneDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8
  },
  textInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  chipListWrap: {
    marginTop: 4
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10
  },
  chip: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  chipText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600"
  },
  addRow: {
    flexDirection: "row",
    gap: 10
  },
  addInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  addBtn: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 14
  },
  addBtnDisabled: {
    opacity: 0.5
  },
  addBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  saveBar: {
    marginTop: 28
  },
  saveBtn: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 52,
    paddingVertical: 14
  },
  saveBtnDisabled: {
    opacity: 0.5
  },
  saveBtnText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: "800"
  },
  btnPressed: {
    opacity: 0.85
  }
});
