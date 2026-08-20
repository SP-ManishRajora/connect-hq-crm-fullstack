import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, RefreshControl, Alert, StyleSheet, Text } from "react-native";
import {
  Card, Button, H1, H2, Muted, Banner, Empty, colors, spacing,
} from "@/components/ui";
import { SyncBar } from "@/components/SyncBar";
import { rejectedVisits, discardVisit, outboxCounts, type OutboxVisit, type OutboxCounts } from "@/db/outbox";
import { runSync } from "@/api/sync";

// The queue, and specifically the work the server REFUSED.
//
// A rejected inspection is the one case where the app cannot fix things on the
// supervisor's behalf: the QR was retired, the round was closed, the device was
// revoked. Those need a person to decide. Hiding them would make the work look
// submitted when it never was, so they get their own screen and stay until
// acknowledged.

export function QueueScreen() {
  const [rejected, setRejected] = useState<OutboxVisit[]>([]);
  const [counts, setCounts] = useState<OutboxCounts | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRejected(await rejectedVisits());
    setCounts(await outboxCounts());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const discard = (v: OutboxVisit) => {
    Alert.alert(
      "Discard this inspection?",
      `${v.locationName || v.code} — the photographs on this phone will be deleted and it will not be sent.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            await discardVisit(v.clientVisitId);
            await load();
          },
        },
      ],
    );
  };

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
              void runSync().then(load);
            }}
          />
        }
      >
        <H1>Upload queue</H1>

        {counts ? (
          <Card>
            <H2>On this phone</H2>
            <Muted>{counts.pendingVisits} inspection(s) waiting to send</Muted>
            <Muted>{counts.pendingPhotos} photograph(s) waiting to upload</Muted>
            <Muted>{counts.pendingActions} other update(s) waiting</Muted>
            <Button
              label="Sync now"
              onPress={() => void runSync().then(load)}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        ) : null}

        {rejected.length > 0 ? (
          <>
            <H2>Refused by the server</H2>
            <Banner tone="error">
              These were not accepted. Read the reason, then discard them once you have dealt with
              it — they will not be sent again on their own.
            </Banner>
            {rejected.map((v) => (
              <Card key={v.clientVisitId}>
                <H2>{v.locationName || v.code}</H2>
                <Muted>Captured {new Date(v.capturedAt).toLocaleString()}</Muted>
                <Text style={s.reason}>{v.error ?? "No reason given"}</Text>
                <Button label="Discard" variant="danger" onPress={() => discard(v)} />
              </Card>
            ))}
          </>
        ) : (
          <Empty
            title="Nothing refused"
            hint="Work the server could not accept would appear here."
          />
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  reason: {
    fontSize: 14,
    color: colors.danger,
    marginVertical: spacing.md,
    lineHeight: 20,
  },
});
