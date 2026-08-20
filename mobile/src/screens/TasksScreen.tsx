import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Alert, TextInput, StyleSheet } from "react-native";
import {
  Card, Button, Badge, H1, H2, Muted, Banner, Empty, Loading, colors, spacing, radius,
} from "@/components/ui";
import { SyncBar } from "@/components/SyncBar";
import { hk, type Issue } from "@/api/housekeeping";
import { queueAction } from "@/db/outbox";
import { runSync, isOnline } from "@/api/sync";

// My Tasks — issues assigned to the signed-in user.
//
// The LIST needs a connection (there is no local copy of work that may have been
// reassigned), but the ACTIONS do not: start and complete are queued and flushed
// like everything else, so a supervisor in a basement can still record that a
// job is done.

export function TasksScreen() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await hk.myIssues();
      setIssues(rows);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async (issue: Issue) => {
    setBusy(issue.id);
    try {
      if (await isOnline()) {
        await hk.startIssue(issue.id);
      } else {
        await queueAction(`/api/housekeeping/issues/${issue.id}/start`, {}, `Start: ${issue.title}`);
      }
      // Optimistic: the row is already queued, so showing the old status would
      // make the supervisor press it again.
      setIssues((prev) =>
        prev.map((i) => (i.id === issue.id ? { ...i, status: "IN_PROGRESS" } : i)),
      );
      void runSync();
    } catch (e) {
      Alert.alert("Could not start", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const complete = async (issue: Issue) => {
    if (!note.trim()) {
      Alert.alert("Add a note", "Describe what you did before marking this complete.");
      return;
    }
    setBusy(issue.id);
    try {
      if (await isOnline()) {
        await hk.completeIssue(issue.id, note.trim());
      } else {
        await queueAction(
          `/api/housekeeping/issues/${issue.id}/complete`,
          { notes: note.trim() },
          `Complete: ${issue.title}`,
        );
      }
      setIssues((prev) => prev.filter((i) => i.id !== issue.id));
      setNoteFor(null);
      setNote("");
      void runSync();
    } catch (e) {
      // The server refuses completion without an after-photograph on some
      // issue types — say so plainly rather than "request failed".
      Alert.alert("Could not complete", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading label="Loading your tasks…" />;

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
        <H1>My tasks</H1>

        {offline ? (
          <Banner tone="warn">
            Offline — showing nothing new. Anything you mark done is saved and sent when signal
            returns.
          </Banner>
        ) : null}

        {issues.length === 0 && !offline ? (
          <Empty title="Nothing assigned to you" hint="Pull down to check again." />
        ) : null}

        {issues.map((i) => (
          <Card key={i.id}>
            <View style={s.row}>
              <Badge label={i.severity} tone={i.severity} />
              <Badge label={i.status.replace(/_/g, " ")} />
            </View>
            <H2>{i.title}</H2>
            {i.location?.name ? <Muted>{i.location.name}</Muted> : null}
            {i.description ? <Text style={s.desc}>{i.description}</Text> : null}
            {i.dueAt ? <Muted>Due {new Date(i.dueAt).toLocaleString()}</Muted> : null}

            {noteFor === i.id ? (
              <>
                <TextInput
                  style={s.input}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  placeholder="What did you do?"
                  placeholderTextColor={colors.textMuted}
                />
                <Button
                  label="Mark complete"
                  variant="success"
                  onPress={() => complete(i)}
                  loading={busy === i.id}
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setNoteFor(null);
                    setNote("");
                  }}
                  style={{ marginTop: spacing.sm }}
                />
              </>
            ) : (
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {i.status !== "IN_PROGRESS" ? (
                  <Button label="Start" onPress={() => start(i)} loading={busy === i.id} />
                ) : null}
                <Button
                  label="Complete"
                  variant="success"
                  onPress={() => {
                    setNoteFor(i.id);
                    setNote("");
                  }}
                />
              </View>
            )}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  desc: { fontSize: 14, color: colors.text, marginVertical: spacing.xs, lineHeight: 20 },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, minHeight: 80,
    textAlignVertical: "top", fontSize: 15, color: colors.text,
    marginVertical: spacing.md,
  },
});
