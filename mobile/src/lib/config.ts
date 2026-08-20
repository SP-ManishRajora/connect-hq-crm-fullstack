import Constants from "expo-constants";

// API host resolution.
//
// Production default is the live CRM. It is overridable so the same source runs
// against a dev server without a code change:
//   * EXPO_PUBLIC_API_BASE_URL wins (set per EAS build profile, see eas.json)
//   * otherwise app.json's extra.apiBaseUrl
//
// Note for emulator work: an Android emulator cannot reach the host machine on
// "localhost" — that resolves to the emulator itself. Use http://10.0.2.2:3000,
// which is what the development build profile sets.
const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
const fromApp = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

export const API_BASE_URL = (fromEnv || fromApp || "https://crm.connecthq.co.in").replace(/\/+$/, "");

// Cleared-text HTTP is only tolerated for local development hosts. A production
// build talking to the live CRM must be HTTPS or the evidence photos and bearer
// token would cross the network in the clear.
export const IS_INSECURE_HOST = API_BASE_URL.startsWith("http://");

export const CONFIG = {
  apiBaseUrl: API_BASE_URL,
  // How many queued visits to push in one sync call. The server caps this at 50.
  syncBatchSize: 25,
  // Photos are downscaled before they are stored in the outbox: a raw phone
  // photo is 3-8 MB, and a day of queued inspections would otherwise fill the
  // device. The server accepts up to 12 MB.
  photoMaxWidth: 1600,
  photoQuality: 0.7,
} as const;
