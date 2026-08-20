import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, RefreshControl, Alert, TextInput, StyleSheet, Image,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import {
  Card, Button, Badge, H1, H2, Muted, Banner, Empty, Loading, colors, spacing, radius,
} from "@/components/ui";
import { SyncBar } from "@/components/SyncBar";
import { hk, type Generator } from "@/api/housekeeping";
import { useSession } from "@/lib/session";
import { CONFIG } from "@/lib/config";
import { isOnline } from "@/api/sync";

// Generator readings.
//
// UNLIKE the rest of the app, this screen requires a connection. Every generator
// write is multipart with a MANDATORY gauge photograph, and the server evaluates
// twelve discrepancy rules against the previous reading at the moment it lands —
// fuel deltas, hour-meter movement, consumption rate. Queuing those offline would
// mean a batch of readings arriving out of order hours later and firing false
// discrepancies at whoever happened to sync last.
//
// So the honest design is: say plainly that this part needs signal, rather than
// accepting work the server will then mis-judge.

type Mode = { kind: "READING" | "ON" | "OFF"; gen: Generator } | null;

export function GeneratorScreen() {
  const { user } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [rows, setRows] = useState<Generator[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [mode, setMode] = useState<Mode>(null);

  // capture state
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [fuelReading, setFuelReading] = useState("");
  const [hourMeter, setHourMeter] = useState("");
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const load = useCallback(async () => {
    if (!user?.centerId) {
      setLoading(false);
      return;
    }
    try {
      setRows(await hk.generators(user.centerId));
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

  // Which photographs each action requires, mirroring the route handlers.
  const requiredShots = (kind: "READING" | "ON" | "OFF") =>
    kind === "READING"
      ? [{ key: "tankPhoto", label: "Fuel tank / gauge" }]
      : kind === "ON"
        ? [
            { key: "panelPhoto", label: "Control panel" },
            { key: "tankPhoto", label: "Fuel tank / gauge" },
          ]
        : [
            { key: "tankPhoto", label: "Fuel tank / gauge" },
            { key: "meterPhoto", label: "Hour meter" },
          ];

  const begin = async (kind: "READING" | "ON" | "OFF", gen: Generator) => {
    if (!(await isOnline())) {
      Alert.alert(
        "Connection needed",
        "Generator readings are checked against the previous one as they arrive, so they cannot be saved offline. Try again once you have signal.",
      );
      return;
    }
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert("Camera needed", "Every generator reading must carry a photograph of the gauge.");
        return;
      }
    }
    setPhotos({});
    setFuelReading("");
    setHourMeter("");
    setMode({ kind, gen });
  };

  const shoot = async (key: string) => {
    if (!cameraRef.current) return;
    setBusy(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (!shot?.uri) return;
      const resized = await ImageManipulator.manipulateAsync(
        shot.uri,
        [{ resize: { width: CONFIG.photoMaxWidth } }],
        { compress: CONFIG.photoQuality, format: ImageManipulator.SaveFormat.JPEG },
      );
      setPhotos((p) => ({ ...p, [key]: resized.uri }));
    } catch (e) {
      Alert.alert("Could not take the photograph", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!mode) return;
    const needed = requiredShots(mode.kind);
    const missing = needed.find((n) => !photos[n.key]);
    if (missing) {
      Alert.alert("Photograph needed", `Take the ${missing.label.toLowerCase()} photograph first.`);
      return;
    }
    if (!fuelReading.trim()) {
      Alert.alert("Fuel reading needed", "Enter the fuel level shown on the gauge.");
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      for (const n of needed) {
        form.append(n.key, {
          uri: photos[n.key],
          name: `${n.key}.jpg`,
          type: "image/jpeg",
        } as unknown as Blob);
      }
      form.append("fuelReading", fuelReading.trim());
      if (hourMeter.trim()) form.append("hourMeter", hourMeter.trim());

      // Position is advisory here but lets the server tell a reading taken at the
      // generator from one typed up in the office.
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted) {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          form.append("lat", String(pos.coords.latitude));
          form.append("lng", String(pos.coords.longitude));
        }
      } catch {
        /* advisory only */
      }

      if (mode.kind === "READING") await hk.generatorReading(mode.gen.id, form);
      else if (mode.kind === "ON") await hk.generatorOn(mode.gen.id, form);
      else await hk.generatorOff(mode.gen.id, form);

      setMode(null);
      await load();
      Alert.alert("Recorded", "The reading has been saved.");
    } catch (e) {
      // Surface the server's own message: it explains WHICH discrepancy rule
      // rejected the entry, which is what the operator needs to act on.
      Alert.alert("Not recorded", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading label="Loading generators…" />;

  if (!user?.centerId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
        <Banner tone="warn">
          Your account is not assigned to a centre. Ask an administrator to set one.
        </Banner>
      </View>
    );
  }

  if (mode) {
    const needed = requiredShots(mode.kind);
    const title =
      mode.kind === "READING" ? "Periodic reading" : mode.kind === "ON" ? "Start generator" : "Stop generator";
    const nextShot = needed.find((n) => !photos[n.key]);

    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
        <H1>{title}</H1>
        <Muted>{mode.gen.name}</Muted>

        {nextShot ? (
          <Card style={{ padding: 0, overflow: "hidden", marginTop: spacing.md }}>
            <CameraView ref={cameraRef} style={{ height: 320 }} facing="back" />
            <View style={{ padding: spacing.lg }}>
              <H2>{nextShot.label}</H2>
              <Button label={`Photograph the ${nextShot.label.toLowerCase()}`} onPress={() => shoot(nextShot.key)} loading={busy} />
            </View>
          </Card>
        ) : (
          <Banner tone="success">All required photographs taken.</Banner>
        )}

        {Object.keys(photos).length > 0 ? (
          <View style={s.thumbRow}>
            {needed
              .filter((n) => photos[n.key])
              .map((n) => (
                <View key={n.key}>
                  <Image source={{ uri: photos[n.key] }} style={s.thumb} />
                  <Text style={s.thumbCaption}>{n.label}</Text>
                </View>
              ))}
          </View>
        ) : null}

        <H2>Fuel reading</H2>
        <TextInput
          style={s.input}
          value={fuelReading}
          onChangeText={setFuelReading}
          keyboardType="decimal-pad"
          placeholder="Litres shown on the gauge"
          placeholderTextColor={colors.textMuted}
        />

        <H2>Hour meter (optional)</H2>
        <TextInput
          style={s.input}
          value={hourMeter}
          onChangeText={setHourMeter}
          keyboardType="decimal-pad"
          placeholder="Running hours"
          placeholderTextColor={colors.textMuted}
        />

        <Button label="Save reading" onPress={submit} loading={busy} style={{ marginTop: spacing.md }} />
        <Button label="Cancel" variant="secondary" onPress={() => setMode(null)} style={{ marginTop: spacing.sm }} />
      </ScrollView>
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
        <H1>Generators</H1>

        <Banner tone="info">
          Readings are checked against the previous one as they arrive, so this screen needs a
          connection — unlike inspections, which work offline.
        </Banner>

        {offline ? <Banner tone="warn">Offline — reconnect to record a reading.</Banner> : null}

        {rows.length === 0 && !offline ? (
          <Empty title="No generators at this centre" hint="An administrator adds these in the web console." />
        ) : null}

        {rows.map((g) => {
          const running = Boolean(g.currentSession);
          return (
            <Card key={g.id}>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
                <Badge label={running ? "RUNNING" : "STOPPED"} tone={running ? "URGENT" : undefined} />
              </View>
              <H2>{g.name}</H2>
              {g.tankCapacityL ? <Muted>Tank {g.tankCapacityL} L</Muted> : null}
              {running && g.currentSession ? (
                <Muted>Started {new Date(g.currentSession.startedAt).toLocaleString()}</Muted>
              ) : null}

              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {running ? (
                  <>
                    <Button label="Record reading" onPress={() => begin("READING", g)} />
                    <Button label="Stop generator" variant="danger" onPress={() => begin("OFF", g)} />
                  </>
                ) : (
                  <>
                    <Button label="Start generator" variant="success" onPress={() => begin("ON", g)} />
                    <Button label="Spot check" variant="secondary" onPress={() => begin("READING", g)} />
                  </>
                )}
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, minHeight: 52,
    fontSize: 16, color: colors.text, marginBottom: spacing.md,
  },
  thumbRow: { flexDirection: "row", gap: spacing.md, marginVertical: spacing.md },
  thumb: { width: 90, height: 90, borderRadius: radius.sm, backgroundColor: colors.border },
  thumbCaption: { fontSize: 11, color: colors.textMuted, marginTop: 4, maxWidth: 90 },
});
