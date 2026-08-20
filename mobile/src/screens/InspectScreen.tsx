import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Alert, TouchableOpacity, Image,
} from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import {
  Button, Card, Banner, H1, H2, Muted, Loading, colors, spacing, radius,
} from "@/components/ui";
import { SyncBar } from "@/components/SyncBar";
import { hk, type Location as HkLocation } from "@/api/housekeeping";
import { getDeviceId } from "@/api/auth";
import { useSession } from "@/lib/session";
import { CONFIG } from "@/lib/config";
import {
  newClientVisitId, queueVisit, queuePhoto, replacePhotoInSlot, photosForVisit,
} from "@/db/outbox";
import { runSync } from "@/api/sync";

// The inspection flow, offline-first throughout.
//
// The round and the area list are fetched when there IS signal and cached in
// component state; the scan, the photos and the submission all go to the outbox
// and upload later. Nothing in this screen blocks on the network.

type Stage = "IDLE" | "SCANNING" | "CAPTURING";

const DEFAULT_ANGLES = [
  "Entrance / full area",
  "Left side",
  "Right side",
  "Close-up / critical point",
];

export function InspectScreen() {
  const { user } = useSession();
  const [permission, requestPermission] = useCameraPermissions();

  const [stage, setStage] = useState<Stage>("IDLE");
  const [roundId, setRoundId] = useState<string | null>(null);
  const [locations, setLocations] = useState<HkLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // active capture
  const [visitId, setVisitId] = useState<string | null>(null);
  const [area, setArea] = useState<HkLocation | null>(null);
  const [code, setCode] = useState<string>("");
  const [angles, setAngles] = useState<string[]>(DEFAULT_ANGLES);
  const [shots, setShots] = useState<{ slot: number; uri: string }[]>([]);
  const [observations, setObservations] = useState("");
  const [scannedAt, setScannedAt] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const gpsRef = useRef<{ lat: number; lng: number; acc: number } | null>(null);

  // --- setup ---------------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!user?.centerId) {
        setNotice("Your account is not assigned to a centre. Ask an administrator to set one.");
        return;
      }
      // Both need signal. Offline, the supervisor continues an existing round
      // from cache — starting a NEW round offline is not possible because the
      // round id comes from the server.
      const [r, locs] = await Promise.all([
        hk.openRound(user.centerId),
        hk.locations(user.centerId),
      ]);
      setRoundId(r.id);
      setLocations(locs);
      setNotice(null);
    } catch {
      setNotice(
        "Could not reach the server. You can still finish a round already open on this phone, but a new one needs a connection.",
      );
    } finally {
      setLoading(false);
    }
  }, [user?.centerId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Dwell timer — the minimum time rule is enforced by the server, but the
  // supervisor has to be able to SEE it or they will submit too early and have
  // the visit flagged.
  useEffect(() => {
    if (stage !== "CAPTURING") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [stage]);

  const dwellSeconds = scannedAt ? Math.floor((now - scannedAt) / 1000) : 0;
  const minDwell = area?.minDwellSeconds ?? 60;
  const dwellOk = dwellSeconds >= minDwell;
  const required = area?.requiredPhotoCount ?? 4;

  // --- scanning ------------------------------------------------------------

  const beginScan = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert(
          "Camera needed",
          "The app photographs each area as inspection evidence, so it needs camera access.",
        );
        return;
      }
    }
    setStage("SCANNING");
  };

  const onBarcode = (res: BarcodeScanningResult) => {
    if (stage !== "SCANNING") return;
    const raw = res.data?.trim();
    if (!raw) return;
    // A printed QR may hold a full URL (…/housekeeping/scan/<code>) or the bare
    // code. Take the last path segment either way.
    const parsed = raw.includes("/") ? raw.split("/").filter(Boolean).pop()! : raw;
    void openArea(parsed);
  };

  const openArea = async (scanned: string) => {
    const match = locations.find((l) => l.qrCodes?.some((q) => q.code === scanned));

    if (!match) {
      // Unknown offline is not necessarily invalid — the area list may be stale.
      // Accept it and let the server judge on sync, rather than blocking someone
      // standing in front of the sticker.
      Alert.alert(
        "Area not recognised",
        "This code is not in the list on this phone. Record it anyway? The server will confirm when you sync.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Record anyway", onPress: () => startCapture(scanned, null) },
        ],
      );
      return;
    }
    startCapture(scanned, match);
  };

  const startCapture = async (scanned: string, loc: HkLocation | null) => {
    setCode(scanned);
    setArea(loc);
    setVisitId(newClientVisitId());
    setShots([]);
    setObservations("");
    setScannedAt(Date.now());
    setNow(Date.now());
    setAngles(DEFAULT_ANGLES.slice(0, loc?.requiredPhotoCount ?? 4));
    setStage("CAPTURING");

    // Fire-and-forget: a GPS fix can take several seconds and must not delay the
    // first photograph. Whatever has arrived by submission time is what is sent.
    void captureGps();
  };

  const captureGps = async () => {
    gpsRef.current = null;
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      gpsRef.current = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy ?? 0,
      };
    } catch {
      // No fix — indoors, or permission refused. The visit is still recorded and
      // the server flags it NO_GPS. Blocking here would stop work entirely.
    }
  };

  // --- photos --------------------------------------------------------------

  const takePhoto = async (slot: number) => {
    if (!cameraRef.current || !visitId) return;
    setBusy(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: false });
      if (!shot?.uri) return;

      // Downscale before it reaches the outbox: a raw phone photo is 3-8 MB and
      // a full offline shift would fill the device.
      const resized = await ImageManipulator.manipulateAsync(
        shot.uri,
        [{ resize: { width: CONFIG.photoMaxWidth } }],
        { compress: CONFIG.photoQuality, format: ImageManipulator.SaveFormat.JPEG },
      );

      // Move into the app's document directory. The camera's cache directory is
      // reclaimable by Android at any time, which would silently empty a queue
      // that has been waiting for signal.
      const dir = `${FileSystem.documentDirectory}hk-photos/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const dest = `${dir}${visitId}-${slot}-${Date.now()}.jpg`;
      await FileSystem.moveAsync({ from: resized.uri, to: dest });

      await replacePhotoInSlot(visitId, slot);
      const g = gpsRef.current;
      await queuePhoto({
        clientVisitId: visitId,
        slot,
        angle: angles[slot] ?? `Photo ${slot + 1}`,
        fileUri: dest,
        captureAt: new Date().toISOString(),
        lat: g?.lat ?? null,
        lng: g?.lng ?? null,
      });

      setShots((prev) => [...prev.filter((p) => p.slot !== slot), { slot, uri: dest }]);
    } catch (e) {
      Alert.alert("Could not save the photograph", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // --- submit --------------------------------------------------------------

  const submit = async () => {
    if (!visitId || !roundId) return;
    const saved = await photosForVisit(visitId);
    if (saved.length < required) {
      Alert.alert(
        "More photographs needed",
        `This area needs ${required}. You have taken ${saved.length}.`,
      );
      return;
    }
    if (!dwellOk) {
      Alert.alert(
        "Too quick",
        `This area has a minimum inspection time of ${minDwell} seconds. Submitting now will flag the visit for review.`,
        [
          { text: "Keep inspecting", style: "cancel" },
          { text: "Submit anyway", style: "destructive", onPress: () => void doSubmit() },
        ],
      );
      return;
    }
    void doSubmit();
  };

  const doSubmit = async () => {
    if (!visitId || !roundId) return;
    setBusy(true);
    try {
      const g = gpsRef.current;
      await queueVisit({
        clientVisitId: visitId,
        roundId,
        code,
        locationName: area?.name ?? code,
        capturedAt: new Date(scannedAt).toISOString(),
        lat: g?.lat ?? null,
        lng: g?.lng ?? null,
        accuracyM: g?.acc ?? null,
        deviceId: await getDeviceId(),
        dwellSeconds,
        observations: observations.trim() || null,
      });

      setStage("IDLE");
      setVisitId(null);
      setArea(null);
      setShots([]);
      // Try immediately; if there is no signal it stays queued and the SyncBar
      // picks it up when coverage returns.
      void runSync();
    } finally {
      setBusy(false);
    }
  };

  const finishRound = async () => {
    if (!roundId) return;
    Alert.alert("Finish this round?", "No more areas can be added to it afterwards.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Finish",
        onPress: async () => {
          try {
            await runSync(); // push queued areas before closing the round
            await hk.completeRound(roundId);
            setRoundId(null);
            await load();
          } catch {
            Alert.alert(
              "Not finished",
              "The round could not be closed — you may be offline. Your inspections are saved and it can be closed once you have signal.",
            );
          }
        },
      },
    ]);
  };

  // --- render --------------------------------------------------------------

  if (loading) return <Loading label="Opening your round…" />;

  if (stage === "SCANNING") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={onBarcode}
        />
        <View style={s.scanOverlay}>
          <Text style={s.scanHint}>Point at the QR code on the wall</Text>
          <TextInput
            style={s.manualInput}
            value={manualCode}
            onChangeText={setManualCode}
            placeholder="…or type the code underneath it"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
          />
          <Button
            label="Use this code"
            onPress={() => manualCode.trim() && void openArea(manualCode.trim())}
            disabled={!manualCode.trim()}
          />
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => setStage("IDLE")}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </View>
    );
  }

  if (stage === "CAPTURING") {
    const nextSlot = shots.length < required ? shots.length : -1;
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <H1>{area?.name ?? "Unrecognised area"}</H1>
          <Muted>
            {shots.length} of {required} photographs · {dwellSeconds}s of {minDwell}s
          </Muted>

          {!dwellOk ? (
            <Banner tone="warn">
              Stay in the area for at least {minDwell} seconds. Submitting earlier flags the
              visit for a supervisor to review.
            </Banner>
          ) : null}

          {nextSlot >= 0 ? (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <CameraView ref={cameraRef} style={{ height: 340 }} facing="back" />
              <View style={{ padding: spacing.lg }}>
                <H2>{angles[nextSlot] ?? `Photo ${nextSlot + 1}`}</H2>
                <Button
                  label={`Take photograph ${nextSlot + 1} of ${required}`}
                  onPress={() => takePhoto(nextSlot)}
                  loading={busy}
                  style={{ marginTop: spacing.sm }}
                />
              </View>
            </Card>
          ) : (
            <Banner tone="success">All {required} photographs taken.</Banner>
          )}

          {shots.length > 0 ? (
            <View style={s.thumbRow}>
              {shots
                .sort((a, b) => a.slot - b.slot)
                .map((p) => (
                  <TouchableOpacity
                    key={p.slot}
                    onLongPress={() => {
                      Alert.alert("Retake this photograph?", angles[p.slot] ?? "", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Retake",
                          onPress: () => setShots((prev) => prev.filter((x) => x.slot !== p.slot)),
                        },
                      ]);
                    }}
                  >
                    <Image source={{ uri: p.uri }} style={s.thumb} />
                    <Text style={s.thumbLabel}>{p.slot + 1}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          ) : null}
          {shots.length > 0 ? <Muted>Press and hold a photograph to retake it.</Muted> : null}

          <H2>Observations (optional)</H2>
          <TextInput
            style={s.textarea}
            value={observations}
            onChangeText={setObservations}
            multiline
            placeholder="Anything the photographs do not show"
            placeholderTextColor={colors.textMuted}
          />

          <Button
            label="Submit this area"
            onPress={submit}
            loading={busy}
            disabled={shots.length < required}
            style={{ marginTop: spacing.lg }}
          />
          <Button
            label="Cancel this area"
            variant="secondary"
            onPress={() =>
              Alert.alert("Discard this area?", "The photographs you have taken will be deleted.", [
                { text: "Keep going", style: "cancel" },
                { text: "Discard", style: "destructive", onPress: () => setStage("IDLE") },
              ])
            }
            style={{ marginTop: spacing.sm }}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SyncBar />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <H1>Inspection round</H1>
        {notice ? <Banner tone="warn">{notice}</Banner> : null}

        {roundId ? (
          <>
            <Card>
              <H2>Round open</H2>
              <Muted>
                Scan the QR code at each area, take the guided photographs and submit. Everything
                is saved on this phone first, so it works with no signal.
              </Muted>
              <Button label="Scan an area" onPress={beginScan} style={{ marginTop: spacing.md }} />
            </Card>
            <Button label="Finish round" variant="secondary" onPress={finishRound} />
          </>
        ) : (
          <Card>
            <H2>No round open</H2>
            <Muted>Starting a round needs a connection. Once open, the rest works offline.</Muted>
            <Button label="Try again" onPress={load} style={{ marginTop: spacing.md }} />
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scanOverlay: { padding: spacing.lg, backgroundColor: "#0f172a" },
  scanHint: {
    color: "#fff", fontSize: 15, textAlign: "center", marginBottom: spacing.md, fontWeight: "600",
  },
  manualInput: {
    backgroundColor: "#1e293b", color: "#fff", borderRadius: radius.md,
    paddingHorizontal: spacing.lg, minHeight: 52, fontSize: 16, marginBottom: spacing.sm,
  },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  thumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.border },
  thumbLabel: {
    position: "absolute", bottom: 4, right: 6, color: "#fff", fontWeight: "800",
    fontSize: 12, textShadowColor: "#000", textShadowRadius: 3,
  },
  textarea: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, minHeight: 90,
    textAlignVertical: "top", fontSize: 15, color: colors.text, marginBottom: spacing.sm,
  },
});
