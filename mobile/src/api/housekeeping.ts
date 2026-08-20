import { api } from "./client";

// Typed bindings for the endpoints the app uses. Every one of these already
// existed for the web module — only /sync and /push/tokens were added for the
// app, so the server surface here is almost entirely shared with the browser.

export type Location = {
  id: string;
  name: string;
  category: string;
  requiredPhotoCount: number;
  minDwellSeconds: number;
  lat: number | null;
  lng: number | null;
  geofenceRadiusM: number;
  qrCodes: { id: string; code: string; version: number }[];
};

export type Round = { id: string; centerId: string; status: string; startedAt: string };

export type Issue = {
  id: string;
  title: string;
  description: string | null;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: string;
  category: string;
  dueAt: string | null;
  location?: { id: string; name: string } | null;
  center?: { id: string; name: string } | null;
};

export type CleaningRequest = {
  id: string;
  status: string;
  priority: string;
  note: string | null;
  createdAt: string;
  location?: { id: string; name: string } | null;
  type?: { id: string; name: string; requiresPhotos: number } | null;
};

export type Generator = {
  id: string;
  name: string;
  status?: string | null;
  tankCapacityL: number | null;
  currentSession?: { id: string; startedAt: string } | null;
};

export const hk = {
  locations: (centerId: string) =>
    api.get<Location[]>(`/api/housekeeping/locations?centerId=${encodeURIComponent(centerId)}`),

  openRound: (centerId: string) =>
    api.post<Round>("/api/housekeeping/rounds", { centerId }),

  completeRound: (roundId: string) =>
    api.post<unknown>(`/api/housekeeping/rounds/${roundId}/complete`, {}),

  // `mine=1` scopes to the signed-in user — the app is a personal work list, not
  // a management console.
  myIssues: () => api.get<Issue[]>("/api/housekeeping/issues?mine=1&open=1"),

  startIssue: (id: string) => api.post<unknown>(`/api/housekeeping/issues/${id}/start`, {}),

  // The server's completeActionSchema field is `notes`, not `note`.
  completeIssue: (id: string, notes: string) =>
    api.post<unknown>(`/api/housekeeping/issues/${id}/complete`, { notes }),

  // `mine=1` for the same reason as issues: staff see the work assigned to
  // them, not the whole centre's queue. Managers use the web console for that.
  requests: (centerId: string) =>
    api.get<CleaningRequest[]>(
      `/api/housekeeping/requests?centerId=${encodeURIComponent(centerId)}&open=1&mine=1`,
    ),

  requestAction: (id: string, action: string, extra: Record<string, unknown> = {}) =>
    api.post<unknown>(`/api/housekeeping/requests/${id}/action`, { action, ...extra }),

  generators: (centerId: string) =>
    api.get<Generator[]>(
      `/api/housekeeping/generators?centerId=${encodeURIComponent(centerId)}`,
    ),

  // Every generator write is multipart with at least one MANDATORY photograph —
  // the fuel ledger is only trustworthy if each entry carries a picture of the
  // gauge it claims to read. These take a prepared FormData rather than a plain
  // object so the caller cannot accidentally omit it.
  //   readings — tankPhoto + fuelReading (required)
  //   on       — panelPhoto + tankPhoto
  //   off      — tankPhoto + meterPhoto
  //   refills  — litres (+ optional photo)
  generatorReading: (id: string, form: FormData) =>
    api.upload<unknown>(`/api/housekeeping/generators/${id}/readings`, form),

  generatorOn: (id: string, form: FormData) =>
    api.upload<unknown>(`/api/housekeeping/generators/${id}/on`, form),

  generatorOff: (id: string, form: FormData) =>
    api.upload<unknown>(`/api/housekeeping/generators/${id}/off`, form),

  generatorRefill: (id: string, form: FormData) =>
    api.upload<unknown>(`/api/housekeeping/generators/${id}/refills`, form),

  registerPush: (token: string, deviceId: string) =>
    api.post<unknown>("/api/housekeeping/push/tokens", { token, deviceId, platform: "android" }),
};
