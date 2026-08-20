import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/lib/session";
import { LoginScreen } from "@/screens/LoginScreen";
import { InspectScreen } from "@/screens/InspectScreen";
import { TasksScreen } from "@/screens/TasksScreen";
import { RequestsScreen } from "@/screens/RequestsScreen";
import { GeneratorScreen } from "@/screens/GeneratorScreen";
import { QueueScreen } from "@/screens/QueueScreen";
import { Loading, colors, spacing } from "@/components/ui";
import { registerForPush } from "@/lib/push";
import { runSync } from "@/api/sync";

// A hand-rolled tab bar rather than react-navigation.
//
// The app is five flat screens with no stack, no deep links and no params: a
// navigation library would add three dependencies and a native build step to
// replace fifteen lines of state. If nested routing is ever needed, that is the
// moment to bring one in.

type TabKey = "inspect" | "tasks" | "requests" | "generator" | "queue";

const TABS: { key: TabKey; label: string; module: string }[] = [
  { key: "inspect", label: "Inspect", module: "hk_inspect" },
  { key: "tasks", label: "Tasks", module: "hk_issues" },
  { key: "requests", label: "Requests", module: "hk_requests" },
  { key: "generator", label: "Generator", module: "hk_generator" },
  { key: "queue", label: "Queue", module: "*" },
];

function Shell() {
  const { user, ready, signOut } = useSession();
  const [tab, setTab] = useState<TabKey>("inspect");

  useEffect(() => {
    if (!user) return;
    void registerForPush();
    // Drain anything left over from the last session as soon as someone signs in.
    void runSync();

    // And again whenever the app returns to the foreground — the most likely
    // moment for a phone to have regained signal.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void runSync();
    });
    return () => sub.remove();
  }, [user]);

  if (!ready) return <Loading label="Starting…" />;
  if (!user) return <LoginScreen />;

  // Only show what this account can actually reach, so nobody taps into a 403.
  const visible = TABS.filter((t) => t.module === "*" || user.modules.includes(t.module));
  const active = visible.some((t) => t.key === tab) ? tab : visible[0]?.key;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "bottom"]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>
            {user.name}
          </Text>
          <Text style={s.role}>{user.role.replace(/_/g, " ")}</Text>
        </View>
        <TouchableOpacity onPress={signOut} hitSlop={12}>
          <Text style={s.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {active === "inspect" ? <InspectScreen /> : null}
        {active === "tasks" ? <TasksScreen /> : null}
        {active === "requests" ? <RequestsScreen /> : null}
        {active === "generator" ? <GeneratorScreen /> : null}
        {active === "queue" ? <QueueScreen /> : null}
      </View>

      <View style={s.tabbar}>
        {visible.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={s.tab}
            onPress={() => setTab(t.key)}
            activeOpacity={0.7}
          >
            <Text style={[s.tabLabel, active === t.key && s.tabLabelActive]}>{t.label}</Text>
            {active === t.key ? <View style={s.tabUnderline} /> : null}
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  role: { fontSize: 11, color: colors.textMuted, letterSpacing: 0.5 },
  signOut: { fontSize: 13, fontWeight: "600", color: colors.primary },
  tabbar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: spacing.md, minHeight: 56 },
  tabLabel: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  tabLabelActive: { color: colors.primary },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    height: 3,
    width: 40,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
});
