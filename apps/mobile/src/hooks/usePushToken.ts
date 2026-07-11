import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

/**
 * apps/mobile/src/hooks/usePushToken.ts — OWNED BY WS-B (Auth & shell).
 *
 * Requests notification permission, obtains the Expo push token, and writes
 * it to `profiles.expo_push_token` on login and whenever the underlying
 * device push token changes (plan §2.4). No-ops until a session/userId
 * exists — call with `session?.user.id ?? null` from app/_layout.tsx.
 */
export function usePushToken(userId: string | null | undefined): void {
  useEffect(() => {
    if (!userId) return;

    let isMounted = true;

    async function registerForPushNotifications() {
      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const existing = await Notifications.getPermissionsAsync();
        let granted = existing.granted;
        if (!granted) {
          const requested = await Notifications.requestPermissionsAsync();
          granted = requested.granted;
        }
        if (!granted) {
          // eslint-disable-next-line no-console
          console.warn("[usePushToken] notification permission not granted");
          return;
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId as
          | string
          | undefined;
        if (!projectId) {
          // Expected until `eas init` fills in EAS_PROJECT_ID (plan §7).
          // eslint-disable-next-line no-console
          console.warn(
            "[usePushToken] missing EAS projectId; run `eas init` (plan §7)"
          );
          return;
        }

        const { data: token } = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        if (!isMounted || !token || !userId) return;

        const { error } = await supabase
          .from("profiles")
          .update({ expo_push_token: token })
          .eq("id", userId);
        if (error) {
          // eslint-disable-next-line no-console
          console.warn("[usePushToken] failed to persist push token", error.message);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[usePushToken] registration failed", err);
      }
    }

    void registerForPushNotifications();

    // Re-register (and persist a fresh Expo token) if the underlying device
    // push token is rolled by the platform while the app is running.
    const subscription = Notifications.addPushTokenListener(() => {
      void registerForPushNotifications();
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [userId]);
}
