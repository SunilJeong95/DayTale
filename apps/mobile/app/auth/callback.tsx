import { useEffect, useRef } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

/**
 * app/auth/callback.tsx — OWNED BY WS-B (Auth & shell).
 *
 * Web-only OAuth redirect target (plan §3): src/features/auth/kakao.ts lets
 * supabase-js do a full-page redirect to the provider on web (no deep-link
 * interception like native has), so the provider bounces back here with
 * `?code=`. Exchange it for a session (PKCE), then hand off to the root
 * layout's session gate. Native builds never render this route — kakao.ts
 * handles the exchange itself via expo-web-browser's in-app auth session.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (Platform.OS !== "web") {
      router.replace("/");
      return;
    }

    const code = new URLSearchParams(window.location.search).get("code");

    (async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          // eslint-disable-next-line no-console
          console.warn("[auth/callback] code exchange failed", error.message);
        }
      }
      router.replace("/");
    })();
  }, [router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
