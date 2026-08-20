import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";
import * as Crypto from "expo-crypto";

// Credential storage.
//
// Tokens live in EncryptedSharedPreferences via expo-secure-store, not
// AsyncStorage: a housekeeping account can read every centre's inspection
// evidence, so a rooted or shared phone must not yield a working session from a
// plain-text file.

const K_ACCESS = "hk.accessToken";
const K_REFRESH = "hk.refreshToken";
const K_USER = "hk.user";
const K_DEVICE = "hk.deviceId";

export type MobileUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  centerId: string | null;
  modules: string[];
};

export async function saveTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(K_ACCESS, accessToken);
  await SecureStore.setItemAsync(K_REFRESH, refreshToken);
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(K_ACCESS);
}
export async function getRefreshToken() {
  return SecureStore.getItemAsync(K_REFRESH);
}

export async function saveUser(u: MobileUser) {
  await SecureStore.setItemAsync(K_USER, JSON.stringify(u));
}
export async function getUser(): Promise<MobileUser | null> {
  const raw = await SecureStore.getItemAsync(K_USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MobileUser;
  } catch {
    return null;
  }
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(K_ACCESS),
    SecureStore.deleteItemAsync(K_REFRESH),
    SecureStore.deleteItemAsync(K_USER),
  ]);
  // The device id deliberately SURVIVES sign-out. It identifies the handset, not
  // the person: rotating it on every logout would defeat admin device
  // revocation, which is keyed on a stable id.
}

/**
 * A stable per-install identifier, sent with every scan so an admin can revoke a
 * lost handset.
 *
 * Honest about the limit — this is app-local storage and a reinstall produces a
 * new id, so it stops casual reuse of a lost phone, not a determined actor. That
 * matches the guarantee the web app already makes with its localStorage id.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(K_DEVICE);
  if (existing) return existing;
  const model = (Device.modelName || "android").replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  const id = `${model}-${Crypto.randomUUID()}`.slice(0, 100);
  await SecureStore.setItemAsync(K_DEVICE, id);
  return id;
}
