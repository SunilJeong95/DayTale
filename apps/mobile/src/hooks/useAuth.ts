import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ProfileRow } from "@daytale/shared";
import { supabase } from "@/lib/supabase";
import {
  signInWithApple,
  signInWithGoogle,
  signInWithKakao,
} from "@/features/auth";

/**
 * apps/mobile/src/hooks/useAuth.ts — OWNED BY WS-B (Auth & shell).
 *
 * Exposes the current Supabase session + the caller's `profiles` row (plan
 * §1.5, §3), plus sign-in functions for Apple/Google/Kakao (delegating to
 * src/features/auth/*) and sign-out. Consumed by app/_layout.tsx's session
 * gate, app/(auth)/login.tsx, and app/onboarding/nickname.tsx.
 *
 * The `profiles` row itself is created server-side by the `on_auth_user_created`
 * trigger (supabase/migrations/0001_init.sql) the moment `auth.users` gets a
 * new row — the client never inserts it directly, only reads/updates it.
 */
export interface UseAuthResult {
  session: Session | null;
  profile: ProfileRow | null;
  isLoading: boolean;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithKakao: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetch the profile row (e.g. after onboarding sets the nickname). */
  refreshProfile: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[useAuth] failed to fetch profile", error.message);
      setProfile(null);
      return;
    }

    setProfile(data);
  }, []);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      if (data.session) {
        await fetchProfile(data.session.user.id);
      }
      if (isMounted) setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        if (newSession) {
          void fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (session) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return {
    session,
    profile,
    isLoading,
    signInWithApple,
    signInWithGoogle,
    signInWithKakao,
    signOut,
    refreshProfile,
  };
}
