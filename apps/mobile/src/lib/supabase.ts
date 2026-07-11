import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@daytale/shared";

/**
 * apps/mobile/src/lib/supabase.ts — OWNED BY WS-B (Auth & shell).
 *
 * supabase-js client using the anon key (safe to embed client-side; RLS
 * enforces isolation per plan §1.1/§1.5). Session persistence uses
 * expo-secure-store per plan §3 library list — expo-secure-store has no web
 * implementation (native-only), so web falls back to localStorage.
 *
 * TODO(WS-B): verify EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
 * are populated (see root .env.example) and wire this client into
 * features/auth/* (signInWithIdToken for Google/Apple, signInWithOAuth for
 * Kakao — plan §3).
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. " +
      "Copy .env.example to .env and fill in Supabase project values."
  );
}

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const WebLocalStorageAdapter = {
  getItem: (key: string) => Promise.resolve(globalThis.localStorage?.getItem(key) ?? null),
  setItem: (key: string, value: string) =>
    Promise.resolve(globalThis.localStorage?.setItem(key, value)),
  removeItem: (key: string) => Promise.resolve(globalThis.localStorage?.removeItem(key)),
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === "web" ? WebLocalStorageAdapter : ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
