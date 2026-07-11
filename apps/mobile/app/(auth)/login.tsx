import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { ko } from "@/i18n/ko";

/**
 * app/(auth)/login.tsx — OWNED BY WS-B (Auth & shell).
 *
 * 3 social login buttons (Google/Apple/Kakao, plan §3). Redirects into the
 * app if a session already exists (the root layout's session gate also
 * handles this, but this covers direct navigation to /login while signed in).
 */
type Provider = "apple" | "google" | "kakao";

export default function LoginScreen() {
  const { session, isLoading, signInWithApple, signInWithGoogle, signInWithKakao } =
    useAuth();
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);

  if (!isLoading && session) {
    return <Redirect href="/" />;
  }

  const handleSignIn = async (provider: Provider, signIn: () => Promise<void>) => {
    if (pendingProvider) return;
    setPendingProvider(provider);
    try {
      await signIn();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[login] ${provider} sign-in failed`, err);
      Alert.alert(ko.common.error, ko.auth.loginFailed);
    } finally {
      setPendingProvider(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.appName}>{ko.common.appName}</Text>
      <Text style={styles.title}>{ko.auth.loginTitle}</Text>

      <TouchableOpacity
        style={[styles.button, styles.appleButton]}
        onPress={() => handleSignIn("apple", signInWithApple)}
        disabled={pendingProvider !== null}
      >
        {pendingProvider === "apple" ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.appleButtonText}>{ko.auth.loginWithApple}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.googleButton]}
        onPress={() => handleSignIn("google", signInWithGoogle)}
        disabled={pendingProvider !== null}
      >
        {pendingProvider === "google" ? (
          <ActivityIndicator color="#1f1f1f" />
        ) : (
          <Text style={styles.googleButtonText}>{ko.auth.loginWithGoogle}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.kakaoButton]}
        onPress={() => handleSignIn("kakao", signInWithKakao)}
        disabled={pendingProvider !== null}
      >
        {pendingProvider === "kakao" ? (
          <ActivityIndicator color="#1f1f1f" />
        ) : (
          <Text style={styles.kakaoButtonText}>{ko.auth.loginWithKakao}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  appName: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    color: "#666666",
    marginBottom: 32,
  },
  button: {
    width: "100%",
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  appleButton: {
    backgroundColor: "#000000",
  },
  appleButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  googleButton: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dddddd",
  },
  googleButtonText: {
    color: "#1f1f1f",
    fontSize: 16,
    fontWeight: "600",
  },
  kakaoButton: {
    backgroundColor: "#fee500",
  },
  kakaoButtonText: {
    color: "#1f1f1f",
    fontSize: 16,
    fontWeight: "600",
  },
});
