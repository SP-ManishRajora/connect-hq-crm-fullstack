import React from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
  type ViewStyle, type TextStyle,
} from "react-native";
import { colors, spacing, radius, severityColor } from "@/lib/theme";

// Shared primitives, styled to match the web housekeeping module's Tailwind
// look (slate surfaces, indigo actions, the same badge colours).

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({
  label, onPress, variant = "primary", disabled, loading, style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "success";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const bg =
    variant === "primary" ? colors.primary
    : variant === "danger" ? colors.danger
    : variant === "success" ? colors.success
    : colors.surface;
  const fg = variant === "secondary" ? colors.text : colors.primaryText;
  const off = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.8}
      style={[
        s.button,
        { backgroundColor: bg, opacity: off ? 0.5 : 1 },
        variant === "secondary" && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[s.buttonText, { color: fg }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function Badge({ label, tone }: { label: string; tone?: string }) {
  const c = (tone && severityColor[tone]) || colors.textMuted;
  return (
    <View style={[s.badge, { backgroundColor: `${c}1A`, borderColor: c }]}>
      <Text style={[s.badgeText, { color: c }]}>{label}</Text>
    </View>
  );
}

export function Banner({
  tone = "info", children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  children: React.ReactNode;
}) {
  const map = {
    info: { bg: colors.infoBg, fg: colors.primary },
    warn: { bg: colors.warningBg, fg: colors.warning },
    error: { bg: colors.dangerBg, fg: colors.danger },
    success: { bg: colors.successBg, fg: colors.success },
  }[tone];
  return (
    <View style={[s.banner, { backgroundColor: map.bg, borderColor: map.fg }]}>
      <Text style={{ color: map.fg, fontSize: 13, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.screen, style]}>{children}</View>;
}

export function H1({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[s.h1, style]}>{children}</Text>;
}
export function H2({ children }: { children: React.ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}
export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={s.muted}>{children}</Text>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      {hint ? <Text style={s.muted}>{hint}</Text> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={s.empty}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text style={[s.muted, { marginTop: spacing.md }]}>{label}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  button: {
    // 52pt: this is used outdoors, one-handed, sometimes with gloves.
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  buttonText: { fontSize: 16, fontWeight: "600" },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  banner: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  h1: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  h2: { fontSize: 16, fontWeight: "600", color: colors.text, marginBottom: spacing.xs },
  muted: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  empty: { padding: spacing.xxl, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: colors.text, marginBottom: spacing.xs },
});

export { colors, spacing, radius };
