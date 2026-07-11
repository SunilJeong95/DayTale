import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { ko } from "@/i18n/ko";

/**
 * app/auth/callback.tsx — OWNED BY WS-B (Auth & shell).
 *
 * Web-only OAuth redirect target (plan §3): src/features/auth/kakao.ts lets
 * supabase-js do a full-page redirect to the provider on web (no deep-link
 * interception like native has), so the provider bounces back here with
 * `?code=`. Exchange it for a session (PKCE), then hand off to the root
 * layout's session gate. Native builds never render this route — kakao.ts
 * handles the exchange itself via expo-web-browser's in-app auth session.
 *
 * On failure we show the raw error instead of silently redirecting to
 * /login — a silent redirect looks identical to "nothing happened" and
 * hides the actual cause (expired code, missing PKCE verifier, etc.).
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const ranRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (Platform.OS !== "web") {
      router.replace("/");
      return;
    }

    const code = new URLSearchParams(window.location.search).get("code");
    const errorDescription = new URLSearchParams(window.location.search).get(
      "error_description"
    );

    (async () => {
      if (errorDescription) {
        setError(errorDescription);
        return;
      }
      if (!code) {
        setError("콜백 URL에 code 파라미터가 없어요");
        return;
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
        code
      );
      if (exchangeError) {
        setError(exchangeError.message);
        return;
      }
      router.replace("/");
    })();
  }, [router]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{ko.auth.callbackFailedTitle}</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={styles.buttonText}>{ko.auth.callbackBackToLogin}</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 14,
    color: "#666666",
    textAlign: "center",
  },
  button: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#1f1f1f",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
