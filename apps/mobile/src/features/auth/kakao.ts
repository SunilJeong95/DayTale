import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";

/**
 * apps/mobile/src/features/auth/kakao.ts — OWNED BY WS-B (Auth & shell).
 *
 * Kakao sign-in via Supabase's built-in Kakao OAuth provider (plan §3):
 * `supabase.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo
 * } })`. No native Kakao SDK needed for v1.
 *
 * Native: opened with `expo-web-browser`'s `openAuthSessionAsync` (needs
 * `skipBrowserRedirect: true` since supabase-js would otherwise try to
 * navigate `window.location`, which doesn't exist on native), then the
 * `code` it returns via the `daytale://auth/callback` deep link is exchanged
 * for a session via `exchangeCodeForSession`.
 *
 * Web: `openAuthSessionAsync` only opens a new tab and can't observe the
 * deep-link-style return, so instead we let supabase-js do a normal
 * full-page redirect (no `skipBrowserRedirect`) to Kakao and back to
 * app/auth/callback.tsx, which performs the code exchange after reload.
 */
export async function signInWithKakao(): Promise<void> {
  if (Platform.OS === "web") {
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo },
    });
    if (error) throw error;
    return;
  }

  const redirectTo = Linking.createURL("auth/callback");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data?.url) {
    throw new Error("카카오 로그인 URL을 가져오지 못했어요");
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== "success" || !result.url) {
    // User canceled/dismissed the auth session — not an error to surface.
    return;
  }

  const code = new URL(result.url).searchParams.get("code");
  if (!code) {
    throw new Error("카카오 로그인 코드를 받지 못했어요");
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}
