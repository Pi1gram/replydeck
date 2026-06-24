import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { login } from "../api/session";
import { ScreenShell } from "../components/ScreenShell";
import { colors } from "../theme/colors";

type LoginScreenProps = {
  onLoggedIn: (email: string) => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = EMAIL_RE.test(email.trim());

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, name || undefined);
      onLoggedIn(user.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell scroll={false}>
      <View style={styles.content}>
        <View style={styles.mark}>
          <Ionicons name="mail-unread-outline" size={34} color={colors.gold} />
        </View>
        <Text style={styles.kicker}>ReplyDeck</Text>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.body}>
          Enter your email to start. We'll set up your account and you'll connect
          your own Outlook next.
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            inputMode="email"
            editable={!busy}
            onSubmitEditing={submit}
          />
          <Text style={styles.label}>Name (optional)</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textSubtle}
            editable={!busy}
            onSubmitEditing={submit}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>

      <Pressable
        style={[styles.button, (!valid || busy) && styles.buttonDisabled]}
        onPress={submit}
        disabled={!valid || busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <>
            <Text style={styles.buttonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.background} />
          </>
        )}
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "center"
  },
  mark: {
    alignItems: "center",
    backgroundColor: colors.goldSoft,
    borderRadius: 30,
    height: 60,
    justifyContent: "center",
    marginBottom: 26,
    width: 60
  },
  kicker: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 12,
    textTransform: "uppercase"
  },
  title: {
    color: colors.text,
    fontSize: 39,
    fontWeight: "900",
    lineHeight: 44
  },
  body: {
    color: colors.textMuted,
    fontSize: 17,
    lineHeight: 25,
    marginTop: 18
  },
  form: {
    marginTop: 30,
    gap: 8
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 8
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  error: {
    color: colors.red,
    fontSize: 14,
    marginTop: 10
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
    opacity: 0.45
  },
  buttonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: "900"
  }
});
