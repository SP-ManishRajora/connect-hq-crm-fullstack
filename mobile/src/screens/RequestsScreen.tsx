import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Alert, StyleSheet } from "react-native";
import {
  Card, Button, Badge, H1, H2, Muted, Banner, Empty, Loading, colors, spacing,
} from "@/components/ui";
import { SyncBar } from "@/components/SyncBar";
import { hk, type CleaningRequest } from "@/api/housekeeping";
import { useSession } from "@/lib/session";
import { queueAction } from "@/db/outbox";
import { runSync, isOnline } from "@/api/sync";

// Cleaning requests assigned to me.
//
// COMPLETE is deliberately NOT offered here. The server may require a QR re-scan
// and at least one after-photograph before it will accept a completion
// (requests/[id]/action), and offering a button that the server then refuses
// would teach staff the app is unreliable. Completion happens in the web console
// or, for the QR-verified path, at the area itself.

const NEXT: Record<string, { action: string; label: string } | undefined> = {
  ASSIGNED: { action: "ACCEPT", label: "Accept" },
  ACCEPTED: { action: "ON_THE_WAY", label: "On my way" },
  ON_THE_WAY: { action: "START", label: "Start work" },
};

export function RequestsScreen() {
  const { user } = useSession();
  const [rows, setRows] = useState<CleaningRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.centerId) {
      setLoading(false);
      return;
    }
    try {
      setRows(await hk.requests(user.centerId));
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.centerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const advance = async (r: CleaningRequest, action: string) => {
    setBusy(r.id);
    try {
      if (await isOnline()) {
        await hk.requestAction(r.id, action);
      } else {
        await queueAction(
          `/api/housekeeping/requests/${r.id}/action`,
          { action },
          `${action}: ${r.type?.name ?? "request"}`,
        );
      }
      const to =
        action === "ACCEPT" ? "ACCEPTED" : action === "ON_THE_WAY" ? "ON_THE_WAY" : "IN_PROGRESS";
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: to } : x)));
      void runSync();
    } catch (e) {
      Alert.alert("Could not update", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const unable = (r: CleaningRequest) => {
    Alert.alert("Unable to complete?", "This sends it back for reassignment.", [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", style: "destructive", onPress: () => void advance(r, "UNABLE") },
    ]);
  };

  if (loading) return <Loading label="Loading requests…" />;

  if (!user?.centerId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
        <Banner tone="warn">
          Your account is not assigned to a centre, so there are no requests to show. Ask an
          administrator to set one.
        </Banner>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SyncBar />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        <H1>Cleaning requests</H1>

        {offline ? (
          <Banner tone="warn">
            Offline — this list may be out of date. Updates you make are saved and sent when signal
            returns.
          </Banner>
        ) : null}

        {rows.length === 0 && !offline ? (
          <Empty title="No open requests" hint="Pull down to check again." />
        ) : null}

        {rows.map((r) => {
          const next = NEXT[r.status];
          return (
            <Card key={r.id}>
              <View style={s.row}>
                <Badge label={r.priority} tone={r.priority} />
                <Badge label={r.status.replace(/_/g, " ")} />
              </View>
              <H2>{r.type?.name ?? "Cleaning request"}</H2>
              {r.location?.name ? <Muted>{r.location.name}</Muted> : null}
              {r.note ? <Text style={s.note}>{r.note}</Text> : null}
              <Muted>Raised {new Date(r.createdAt).toLocaleString()}</Muted>

              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {next ? (
                  <Button
                    label={next.label}
                    onPress={() => advance(r, next.action)}
                    loading={busy === r.id}
                  />
                ) : null}
                {r.status === "IN_PROGRESS" ? (
                  <Banner tone="info">
                    Finish this in the web console or at the area — completing a request needs the
                    area QR code and an after-photograph.
                  </Banner>
                ) : null}
                <Button label="Unable to complete" variant="secondary" onPress={() => unable(r)} />
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  note: { fontSize: 14, color: colors.text, marginVertical: spacing.xs, lineHeight: 20 },
});
