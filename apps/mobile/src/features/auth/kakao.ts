import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";

/**
 * apps/mobile/src/features/auth/kakao.ts — OWNED BY WS-B (Auth & shell).
 *
 * Kakao sign-in via Supabase's built-in Kakao OAuth provider (plan §3):
 * `supabase.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo
 * } })` opened with `expo-web-browser`'s `openAuthSessionAsync`, then
 * exchange the returned `code` for a session via `exchangeCodeForSession`.
 * No native Kakao SDK needed for v1.
 *
 * `skipBrowserRedirect: true` is required in React Native — without it
 * supabase-js tries to navigate `window.location`, which does not exist on
 * native; we need the authorize URL back so we can open it ourselves.
 */
export async function signInWithKakao(): Promise<void> {
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
