import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, AppState } from "react-native";
import { runSync, isOnline, counts } from "@/api/sync";
import type { OutboxCounts } from "@/db/outbox";
import { colors, spacing, radius } from "@/lib/theme";

// A permanent strip showing what is still on the phone and what is on the
// server. Staff working offline need to see that their work is SAFE but not yet
// sent — the state that silently loses work in most apps is the one where the
// user believes it was uploaded.

const EMPTY: OutboxCounts = {
  pendingVisits: 0, pendingPhotos: 0, pendingActions: 0, rejected: 0,
};

export function SyncBar({ onPressRejected }: { onPressRejected?: () => void }) {
  const [c, setC] = useState<OutboxCounts>(EMPTY);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const [n, on] = await Promise.all([counts(), isOnline()]);
    if (!mounted.current) return;
    setC(n);
    setOnline(on);
    return { n, on };
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await runSync();
    } finally {
      if (mounted.current) {
        setSyncing(false);
        await refresh();
      }
    }
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;

    // Poll rather than subscribe: expo-network has no reliable change event on
    // every Android version, and a 10s tick is cheap next to a camera session.
    const tick = setInterval(async () => {
      const r = await refresh();
      // Auto-drain the moment signal returns, so a supervisor walking back into
      // coverage does not have to remember to press anything.
      if (r?.on && (r.n.pendingVisits > 0 || r.n.pendingPhotos > 0 || r.n.pendingActions > 0)) {
        void sync();
      }
    }, 10000);

    void refresh();

    // Returning to the foreground is the other moment worth checking.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });

    return () => {
      mounted.current = false;
      clearInterval(tick);
      sub.remove();
    };
  }, [refresh, sync]);

  const queued = c.pendingVisits + c.pendingPhotos + c.pendingActions;
  const tone = !online ? colors.warning : queued > 0 ? colors.primary : colors.success;
  const bg = !online ? colors.warningBg : queued > 0 ? colors.infoBg : colors.successBg;

  const label = !online
    ? queued > 0
      ? `Offline — ${queued} item${queued === 1 ? "" : "s"} saved on this phone`
      : "Offline — your work will be saved here"
    : queued > 0
      ? syncing
        ? `Syncing ${queued}…`
        : `${queued} waiting to upload`
      : "All work uploaded";

  return (
    <View>
      <TouchableOpacity
        onPress={online && queued > 0 ? sync : undefined}
        activeOpacity={online && queued > 0 ? 0.7 : 1}
        style={[st.bar, { backgroundColor: bg, borderColor: tone }]}
      >
        <View style={[st.dot, { backgroundColor: tone }]} />
        <Text style={[st.text, { color: tone }]} numberOfLines={1}>
          {label}
        </Text>
        {online && queued > 0 && !syncing ? <Text style={[st.action, { color: tone }]}>Sync now</Text> : null}
      </TouchableOpacity>

      {c.rejected > 0 ? (
        <TouchableOpacity
          onPress={onPressRejected}
          style={[st.bar, { backgroundColor: colors.dangerBg, borderColor: colors.danger }]}
        >
          <View style={[st.dot, { backgroundColor: colors.danger }]} />
          <Text style={[st.text, { color: colors.danger }]} numberOfLines={1}>
            {c.rejected} item{c.rejected === 1 ? "" : "s"} the server refused
          </Text>
          <Text style={[st.action, { color: colors.danger }]}>Review</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, fontSize: 13, fontWeight: "600" },
  action: { fontSize: 13, fontWeight: "700", textDecorationLine: "underline" },
});
