import React, { useState } from "react";
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useSession } from "@/lib/session";
import { Button, Banner, colors, spacing, radius } from "@/components/ui";
import { API_BASE_URL, IS_INSECURE_HOST } from "@/lib/config";

export function LoginScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await signIn(email, password);
    setBusy(false);
    if (!r.ok) setError(r.error);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>ConnectHQ</Text>
        <Text style={s.sub}>Housekeeping</Text>

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          placeholder="you@connecthq.co.in"
          placeholderTextColor={colors.textMuted}
          editable={!busy}
        />

        <Text style={s.label}>Password</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
          editable={!busy}
          onSubmitEditing={submit}
          returnKeyType="go"
        />

        <Button label="Sign in" onPress={submit} loading={busy} style={{ marginTop: spacing.lg }} />

        <Text style={s.host} numberOfLines={1}>
          {API_BASE_URL.replace(/^https?:\/\//, "")}
        </Text>

        {IS_INSECURE_HOST ? (
          // Visible on purpose: a development build pointed at a plain-HTTP host
          // sends the bearer token and evidence photos in the clear, and nobody
          // should ship that to staff without noticing.
          <Banner tone="warn">
            Development build — this connection is not encrypted. Do not use real
            credentials.
          </Banner>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.xl, paddingTop: 80, flexGrow: 1 },
  title: { fontSize: 30, fontWeight: "800", color: colors.text, textAlign: "center" },
  sub: {
    fontSize: 15, color: colors.textMuted, textAlign: "center",
    marginBottom: spacing.xxl, letterSpacing: 1.5, textTransform: "uppercase",
  },
  label: {
    fontSize: 13, fontWeight: "600", color: colors.text,
    marginBottom: spacing.xs, marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    fontSize: 16,
    color: colors.text,
  },
  host: {
    textAlign: "center", color: colors.textMuted, fontSize: 12,
    marginTop: spacing.xl, marginBottom: spacing.md,
  },
});
