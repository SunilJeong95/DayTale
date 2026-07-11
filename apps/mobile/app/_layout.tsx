import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePushToken } from "@/hooks/usePushToken";

/**
 * app/_layout.tsx — root providers + session gate (plan §1.4, §4).
 *
 *   1. QueryClientProvider (generic)
 *   2. Supabase session gate — redirect to (auth)/login when no session, to
 *      onboarding/nickname when session exists but profile.nickname is null,
 *      otherwise render (tabs)/the rest of the app.
 *   3. Push registration — usePushToken() keeps profiles.expo_push_token
 *      current once a session exists (plan §2.4).
 */
function SessionGate() {
  const { session, profile, isLoading } = useAuth();
  usePushToken(session?.user.id ?? null);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      {!session ? (
        <Redirect href="/(auth)/login" />
      ) : !profile?.nickname ? (
        <Redirect href="/onboarding/nickname" />
      ) : null}
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionGate />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
