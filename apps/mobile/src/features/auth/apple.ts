import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "@/lib/supabase";

/**
 * apps/mobile/src/features/auth/apple.ts — OWNED BY WS-B (Auth & shell).
 *
 * Apple Sign-In (plan §3): obtain an identity token via
 * `expo-apple-authentication`, then exchange it for a Supabase session via
 * `supabase.auth.signInWithIdToken({ provider: 'apple', token })`.
 */
export async function signInWithApple(): Promise<void> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;

  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err) {
    // expo-apple-authentication rejects with ERR_REQUEST_CANCELED when the
    // user dismisses the system sign-in sheet — not a real failure.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "ERR_REQUEST_CANCELED"
    ) {
      return;
    }
    throw err;
  }

  if (!credential.identityToken) {
    throw new Error("Apple 로그인에서 identity token을 받지 못했어요");
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  });

  if (error) throw error;
}
