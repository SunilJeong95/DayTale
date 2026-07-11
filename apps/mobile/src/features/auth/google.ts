import Constants from "expo-constants";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { supabase } from "@/lib/supabase";

/**
 * apps/mobile/src/features/auth/google.ts — OWNED BY WS-B (Auth & shell).
 *
 * Google Sign-In (plan §3): `@react-native-google-signin/google-signin`
 * (native) -> idToken -> supabase.auth.signInWithIdToken({ provider:
 * 'google', token }).
 *
 * Client IDs come from app.config.ts's `extra.googleWebClientId` /
 * `extra.googleIosClientId`, which are themselves sourced from the
 * unprefixed GOOGLE_WEB_CLIENT_ID / GOOGLE_IOS_CLIENT_ID env vars
 * (.env.example) at config-eval time. We read them back here via
 * expo-constants rather than EXPO_PUBLIC_* env vars because app.config.ts
 * runs in Node (not bundled), matching the existing extra.eas.projectId
 * pass-through pattern already used for the push token setup.
 */
const googleWebClientId = Constants.expoConfig?.extra?.googleWebClientId as
  | string
  | undefined;
const googleIosClientId = Constants.expoConfig?.extra?.googleIosClientId as
  | string
  | undefined;

GoogleSignin.configure({
  webClientId: googleWebClientId,
  iosClientId: googleIosClientId,
});

export async function signInWithGoogle(): Promise<void> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  if (response.type === "cancelled") return;

  const idToken = response.data.idToken;
  if (!idToken) {
    throw new Error("Google 로그인에서 idToken을 받지 못했어요");
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });

  if (error) throw error;
}
