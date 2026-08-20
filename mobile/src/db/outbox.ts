import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";

// The offline outbox.
//
// Everything the supervisor does is written here FIRST and uploaded later, even
// when the network is available. That is deliberate: a "save, then upload"
// design has one code path, so the offline case is exercised on every single
// inspection rather than only in the dead spots where bugs would otherwise be
// discovered at the worst possible moment.
//
// Photo BYTES are not stored in SQLite. They stay as files in the app's document
// directory and the row holds a path — a day of 4-photo inspections is hundreds
// of megabytes, which would bloat the database and every backup of it.

const DB_NAME = "housekeeping.db";

export type OutboxVisit = {
  clientVisitId: string;
  roundId: string;
  code: string;
  locationName: string;
  capturedAt: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  deviceId: string;
  dwellSeconds: number | null;
  observations: string | null;
  status: "PENDING" | "SYNCED" | "REJECTED";
  serverVisitId: string | null;
  error: string | null;
  attempts: number;
};

export type OutboxPhoto = {
  id: string;
  clientVisitId: string;
  slot: number;
  angle: string;
  fileUri: string;
  captureAt: string;
  lat: number | null;
  lng: number | null;
  status: "PENDING" | "UPLOADED" | "FAILED";
  error: string | null;
  attempts: number;
};

export type OutboxAction = {
  id: string;
  path: string;
  method: string;
  body: string;
  label: string;
  createdAt: string;
  status: string;
  error: string | null;
  attempts: number;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  return dbPromise;
}

export async function initDb() {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS outbox_visits (
      clientVisitId TEXT PRIMARY KEY NOT NULL,
      roundId       TEXT NOT NULL,
      code          TEXT NOT NULL,
      locationName  TEXT NOT NULL DEFAULT '',
      capturedAt    TEXT NOT NULL,
      lat           REAL,
      lng           REAL,
      accuracyM     REAL,
      deviceId      TEXT NOT NULL,
      dwellSeconds  INTEGER,
      observations  TEXT,
      status        TEXT NOT NULL DEFAULT 'PENDING',
      serverVisitId TEXT,
      error         TEXT,
      attempts      INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS outbox_photos (
      id            TEXT PRIMARY KEY NOT NULL,
      clientVisitId TEXT NOT NULL,
      slot          INTEGER NOT NULL,
      angle         TEXT NOT NULL DEFAULT '',
      fileUri       TEXT NOT NULL,
      captureAt     TEXT NOT NULL,
      lat           REAL,
      lng           REAL,
      status        TEXT NOT NULL DEFAULT 'PENDING',
      error         TEXT,
      attempts      INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_visits_status ON outbox_visits(status);
    CREATE INDEX IF NOT EXISTS idx_photos_status ON outbox_photos(status);
    CREATE INDEX IF NOT EXISTS idx_photos_visit  ON outbox_photos(clientVisitId);

    -- Generic queue for the non-inspection workflows (task and request actions).
    -- Those are small JSON posts to endpoints that already exist, so they share
    -- one table rather than needing a schema each.
    CREATE TABLE IF NOT EXISTS outbox_actions (
      id        TEXT PRIMARY KEY NOT NULL,
      path      TEXT NOT NULL,
      method    TEXT NOT NULL DEFAULT 'POST',
      body      TEXT NOT NULL,
      label     TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      status    TEXT NOT NULL DEFAULT 'PENDING',
      error     TEXT,
      attempts  INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_actions_status ON outbox_actions(status);
  `);
}

export function newClientVisitId() {
  // Must be >= 8 chars and collision-resistant across handsets — the server uses
  // it as the idempotency key, so a collision would return one supervisor's
  // visit to another as a DUPLICATE.
  return `cv-${Crypto.randomUUID()}`;
}

// --- visits ------------------------------------------------------------------

export async function queueVisit(
  v: Omit<OutboxVisit, "status" | "serverVisitId" | "error" | "attempts">,
) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO outbox_visits
       (clientVisitId, roundId, code, locationName, capturedAt, lat, lng, accuracyM,
        deviceId, dwellSeconds, observations, status, attempts)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'PENDING', 0)`,
    [
      v.clientVisitId, v.roundId, v.code, v.locationName, v.capturedAt,
      v.lat, v.lng, v.accuracyM, v.deviceId, v.dwellSeconds, v.observations,
    ],
  );
}

export async function pendingVisits(limit = 25): Promise<OutboxVisit[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxVisit>(
    `SELECT * FROM outbox_visits WHERE status = 'PENDING' ORDER BY capturedAt ASC LIMIT ?`,
    [limit],
  );
}

export async function markVisitSynced(clientVisitId: string, serverVisitId: string) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox_visits SET status='SYNCED', serverVisitId=?, error=NULL WHERE clientVisitId=?`,
    [serverVisitId, clientVisitId],
  );
}

export async function markVisitRejected(clientVisitId: string, error: string) {
  const db = await getDb();
  // Rejected rows are KEPT, not deleted. A supervisor whose work was refused
  // must be able to see why; silently dropping it would look like the
  // inspection simply vanished.
  await db.runAsync(
    `UPDATE outbox_visits SET status='REJECTED', error=?, attempts=attempts+1 WHERE clientVisitId=?`,
    [error, clientVisitId],
  );
}

export async function bumpVisitAttempt(clientVisitId: string, error: string) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox_visits SET attempts=attempts+1, error=? WHERE clientVisitId=?`,
    [error, clientVisitId],
  );
}

// --- photos ------------------------------------------------------------------

export async function queuePhoto(
  p: Omit<OutboxPhoto, "id" | "status" | "error" | "attempts">,
) {
  const db = await getDb();
  const id = `ph-${Crypto.randomUUID()}`;
  await db.runAsync(
    `INSERT INTO outbox_photos
       (id, clientVisitId, slot, angle, fileUri, captureAt, lat, lng, status, attempts)
     VALUES (?,?,?,?,?,?,?,?, 'PENDING', 0)`,
    [id, p.clientVisitId, p.slot, p.angle, p.fileUri, p.captureAt, p.lat, p.lng],
  );
  return id;
}

/** Replace a retake in the same slot, deleting the superseded file. */
export async function replacePhotoInSlot(clientVisitId: string, slot: number) {
  const db = await getDb();
  const old = await db.getAllAsync<OutboxPhoto>(
    `SELECT * FROM outbox_photos WHERE clientVisitId=? AND slot=? AND status='PENDING'`,
    [clientVisitId, slot],
  );
  for (const row of old) {
    await deleteFileQuietly(row.fileUri);
    await db.runAsync(`DELETE FROM outbox_photos WHERE id=?`, [row.id]);
  }
}

export async function photosForVisit(clientVisitId: string): Promise<OutboxPhoto[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxPhoto>(
    `SELECT * FROM outbox_photos WHERE clientVisitId=? ORDER BY slot ASC`,
    [clientVisitId],
  );
}

/**
 * Photos whose visit has already synced — only those can be uploaded, because
 * the server needs a real visit row to attach them to.
 */
export async function uploadablePhotos(limit = 10): Promise<OutboxPhoto[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxPhoto>(
    `SELECT p.* FROM outbox_photos p
       JOIN outbox_visits v ON v.clientVisitId = p.clientVisitId
     WHERE p.status='PENDING' AND v.status='SYNCED'
     ORDER BY p.captureAt ASC LIMIT ?`,
    [limit],
  );
}

export async function markPhotoUploaded(id: string, fileUri: string) {
  const db = await getDb();
  await db.runAsync(`UPDATE outbox_photos SET status='UPLOADED', error=NULL WHERE id=?`, [id]);
  // The server now holds the evidence; the local copy is dead weight on a phone
  // that has to survive a full shift of photographs.
  await deleteFileQuietly(fileUri);
}

export async function bumpPhotoAttempt(id: string, error: string) {
  const db = await getDb();
  await db.runAsync(`UPDATE outbox_photos SET attempts=attempts+1, error=? WHERE id=?`, [
    error,
    id,
  ]);
}

// --- generic actions ---------------------------------------------------------

export async function queueAction(path: string, body: unknown, label: string, method = "POST") {
  const db = await getDb();
  const id = `ac-${Crypto.randomUUID()}`;
  await db.runAsync(
    `INSERT INTO outbox_actions (id, path, method, body, label, createdAt, status, attempts)
     VALUES (?,?,?,?,?,?, 'PENDING', 0)`,
    [id, path, method, JSON.stringify(body), label, new Date().toISOString()],
  );
  return id;
}

export async function pendingActions(limit = 25): Promise<OutboxAction[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxAction>(
    `SELECT * FROM outbox_actions WHERE status='PENDING' ORDER BY createdAt ASC LIMIT ?`,
    [limit],
  );
}

export async function markActionDone(id: string) {
  const db = await getDb();
  await db.runAsync(`UPDATE outbox_actions SET status='DONE', error=NULL WHERE id=?`, [id]);
}

export async function markActionFailed(id: string, error: string, permanent: boolean) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox_actions SET status=?, error=?, attempts=attempts+1 WHERE id=?`,
    [permanent ? "FAILED" : "PENDING", error, id],
  );
}

// --- status ------------------------------------------------------------------

export type OutboxCounts = {
  pendingVisits: number;
  pendingPhotos: number;
  pendingActions: number;
  rejected: number;
};

export async function outboxCounts(): Promise<OutboxCounts> {
  const db = await getDb();
  const one = async (sql: string) => (await db.getFirstAsync<{ n: number }>(sql))?.n ?? 0;
  return {
    pendingVisits: await one(`SELECT COUNT(*) n FROM outbox_visits WHERE status='PENDING'`),
    pendingPhotos: await one(`SELECT COUNT(*) n FROM outbox_photos WHERE status='PENDING'`),
    pendingActions: await one(`SELECT COUNT(*) n FROM outbox_actions WHERE status='PENDING'`),
    rejected: await one(`SELECT COUNT(*) n FROM outbox_visits WHERE status='REJECTED'`),
  };
}

export async function rejectedVisits(): Promise<OutboxVisit[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxVisit>(
    `SELECT * FROM outbox_visits WHERE status='REJECTED' ORDER BY capturedAt DESC`,
  );
}

/** Discard a rejected visit the supervisor has acknowledged. */
export async function discardVisit(clientVisitId: string) {
  const db = await getDb();
  const photos = await photosForVisit(clientVisitId);
  for (const p of photos) await deleteFileQuietly(p.fileUri);
  await db.runAsync(`DELETE FROM outbox_photos WHERE clientVisitId=?`, [clientVisitId]);
  await db.runAsync(`DELETE FROM outbox_visits WHERE clientVisitId=?`, [clientVisitId]);
}

/**
 * Housekeeping for the queue itself: drop synced visits whose photos have all
 * uploaded. Without this the table grows for the life of the install.
 */
export async function pruneCompleted() {
  const db = await getDb();
  await db.runAsync(`DELETE FROM outbox_photos WHERE status='UPLOADED'`);
  await db.runAsync(`DELETE FROM outbox_actions WHERE status='DONE'`);
  await db.runAsync(
    `DELETE FROM outbox_visits
      WHERE status='SYNCED'
        AND clientVisitId NOT IN (SELECT DISTINCT clientVisitId FROM outbox_photos)`,
  );
}

async function deleteFileQuietly(uri: string) {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // A missing file is the expected case on a retry — never fail the queue for it.
  }
}
