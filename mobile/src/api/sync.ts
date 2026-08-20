import * as Network from "expo-network";
import * as FileSystem from "expo-file-system";
import { api, ApiError, SessionExpiredError } from "./client";
import { CONFIG } from "@/lib/config";
import {
  pendingVisits,
  markVisitSynced,
  markVisitRejected,
  bumpVisitAttempt,
  uploadablePhotos,
  markPhotoUploaded,
  bumpPhotoAttempt,
  pendingActions,
  markActionDone,
  markActionFailed,
  pruneCompleted,
  outboxCounts,
  type OutboxCounts,
} from "@/db/outbox";

// The sync engine.
//
// ORDER MATTERS: visits, then photos, then actions. A photo can only be attached
// to a visit the server already knows about, so uploading photos first would
// fail every time. `uploadablePhotos` enforces the same rule in SQL.
//
// PERMANENT vs TRANSIENT failure is the central distinction. Retrying forever on
// a 400 burns battery and never succeeds; giving up on a timeout loses work that
// was perfectly good. The rule used throughout:
//   * 4xx (except 408/429) — the server has judged the item. Stop, surface it.
//   * anything else — network, timeout, 5xx. Keep it queued and retry.

export type SyncResult = {
  ran: boolean; // false when there was nothing to do or no connectivity
  synced: number;
  rejected: number;
  photosUploaded: number;
  actionsDone: number;
  error?: string;
};

function isPermanent(e: unknown): boolean {
  if (e instanceof ApiError) {
    if (e.status === 408 || e.status === 429) return false; // ask again later
    return e.status >= 400 && e.status < 500;
  }
  return false;
}

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export async function isOnline(): Promise<boolean> {
  try {
    const s = await Network.getNetworkStateAsync();
    return Boolean(s.isConnected && s.isInternetReachable !== false);
  } catch {
    // If the check itself fails, assume online and let the request decide — a
    // false negative here would strand a queue that could have drained.
    return true;
  }
}

let syncInFlight: Promise<SyncResult> | null = null;

/**
 * Drain the outbox. Safe to call from anywhere and at any time — concurrent
 * callers share one run, so a screen focus and a reconnect firing together
 * cannot double-upload.
 */
export function runSync(): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = drain().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function drain(): Promise<SyncResult> {
  const result: SyncResult = {
    ran: false, synced: 0, rejected: 0, photosUploaded: 0, actionsDone: 0,
  };

  if (!(await isOnline())) return result;
  result.ran = true;

  try {
    await syncVisits(result);
    await uploadPhotos(result);
    await flushActions(result);
    await pruneCompleted();
  } catch (e) {
    if (e instanceof SessionExpiredError) {
      // The app is about to show the login screen; the queue survives untouched
      // and drains after the next sign-in.
      result.error = e.message;
      return result;
    }
    result.error = message(e);
  }

  return result;
}

// --- visits ------------------------------------------------------------------

type SyncItemResult = {
  clientVisitId: string;
  status: "SYNCED" | "DUPLICATE" | "REJECTED";
  visitId?: string;
  flags?: string[];
  error?: string;
};

async function syncVisits(result: SyncResult) {
  const batch = await pendingVisits(CONFIG.syncBatchSize);
  if (batch.length === 0) return;

  const payload = {
    visits: batch.map((v) => ({
      clientVisitId: v.clientVisitId,
      roundId: v.roundId,
      code: v.code,
      capturedAt: v.capturedAt,
      lat: v.lat,
      lng: v.lng,
      accuracyM: v.accuracyM,
      deviceId: v.deviceId,
      dwellSeconds: v.dwellSeconds,
      observations: v.observations,
    })),
  };

  let res: { results: SyncItemResult[] };
  try {
    res = await api.post<{ results: SyncItemResult[] }>("/api/housekeeping/sync", payload, {
      timeoutMs: 45000,
    });
  } catch (e) {
    if (e instanceof SessionExpiredError) throw e;
    // The whole call failed, so no item was judged. Count an attempt against
    // each so a permanently poisonous batch is visible in the queue screen, but
    // keep them all PENDING.
    for (const v of batch) await bumpVisitAttempt(v.clientVisitId, message(e));
    if (isPermanent(e)) throw e; // a 400 on the batch shape is a bug, not a blip
    return;
  }

  for (const item of res.results) {
    if (item.status === "SYNCED" || item.status === "DUPLICATE") {
      // DUPLICATE means the server already had it — the previous attempt did
      // land and only the acknowledgement was lost. Same outcome for us.
      await markVisitSynced(item.clientVisitId, item.visitId ?? "");
      result.synced += 1;
    } else {
      await markVisitRejected(item.clientVisitId, item.error ?? "Rejected by the server");
      result.rejected += 1;
    }
  }
}

// --- photos ------------------------------------------------------------------

async function uploadPhotos(result: SyncResult) {
  const photos = await uploadablePhotos(10);

  for (const p of photos) {
    try {
      const info = await FileSystem.getInfoAsync(p.fileUri);
      if (!info.exists) {
        // The file is gone — cleared by the OS or a previous partial run. There
        // is nothing left to upload, so stop retrying it forever.
        await bumpPhotoAttempt(p.id, "The photo file is no longer on this device");
        continue;
      }

      const form = new FormData();
      // React Native's FormData takes this {uri,name,type} shape rather than a Blob.
      form.append("file", {
        uri: p.fileUri,
        name: `visit-${p.slot}.jpg`,
        type: "image/jpeg",
      } as unknown as Blob);
      // Addressed by the CLIENT id: the app never has to learn the server's
      // visit id, and the server resolves it (see photos/route.ts).
      form.append("clientVisitId", p.clientVisitId);
      form.append("slot", String(p.slot));
      form.append("angle", p.angle);
      form.append("captureAt", p.captureAt);
      form.append("source", "CAMERA");
      if (p.lat != null) form.append("lat", String(p.lat));
      if (p.lng != null) form.append("lng", String(p.lng));

      await api.upload("/api/housekeeping/photos", form);
      await markPhotoUploaded(p.id, p.fileUri);
      result.photosUploaded += 1;
    } catch (e) {
      if (e instanceof SessionExpiredError) throw e;
      await bumpPhotoAttempt(p.id, message(e));
      // One bad photo must not stall the ones behind it, but a network outage
      // will fail all of them — stop early rather than grinding through.
      if (!isPermanent(e)) break;
    }
  }
}

// --- queued actions ----------------------------------------------------------

async function flushActions(result: SyncResult) {
  const actions = await pendingActions();

  for (const a of actions) {
    try {
      await api.post(a.path, JSON.parse(a.body));
      await markActionDone(a.id);
      result.actionsDone += 1;
    } catch (e) {
      if (e instanceof SessionExpiredError) throw e;
      const permanent = isPermanent(e);
      await markActionFailed(a.id, message(e), permanent);
      if (!permanent) break; // offline again — leave the rest queued
    }
  }
}

export async function counts(): Promise<OutboxCounts> {
  return outboxCounts();
}
