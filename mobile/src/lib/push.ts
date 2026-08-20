import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { hk } from "@/api/housekeeping";
import { getDeviceId } from "@/api/auth";

// Push registration.
//
// Scope matches the server (docs/housekeeping-deferred.md D-30): URGENT cleaning
// requests and CRITICAL issues only. Nothing here decides what to send — the
// server filters — but the channel is named "urgent" so Android's own settings
// show the user exactly what they would be muting.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPush(): Promise<string | null> {
  // A simulator has no push token; asking would throw and block sign-in.
  if (!Device.isDevice) return null;

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("housekeeping-urgent", {
        name: "Urgent housekeeping",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    // Refusing notifications must not break anything else — the work still
    // appears in the app and by email.
    if (status !== "granted") return null;

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined))
      .data;

    await hk.registerPush(token, await getDeviceId());
    return token;
  } catch {
    // Push is an extra nudge, never the only delivery path. A failure here is
    // silent by design.
    return null;
  }
}
