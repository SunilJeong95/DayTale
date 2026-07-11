import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { ko } from "@/i18n/ko";

/** Postgres unique-violation error code (profiles.nickname has a plain
 * `unique` constraint with no app-level pre-check — see plan §1.5). */
const POSTGRES_UNIQUE_VIOLATION = "23505";

/**
 * app/onboarding/nickname.tsx — OWNED BY WS-B (Auth & shell).
 *
 * First-run nickname form, only reachable when `profiles.nickname is null`
 * (app/_layout.tsx session gate, plan §1.5 CRITIC FIX #7). Sets nickname via
 * a unique-checked UPDATE; a 23505 unique violation (nickname already taken)
 * is handled gracefully so the user can retry.
 */
export default function NicknameOnboardingScreen() {
  const { session, refreshProfile } = useAuth();
  const [nickname, setNickname] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const trimmed = nickname.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting && !!session;

  const handleSubmit = async () => {
    if (!canSubmit || !session) return;

    setIsSubmitting(true);
    setErrorText(null);

    const { error } = await supabase
      .from("profiles")
      .update({ nickname: trimmed })
      .eq("id", session.user.id);

    if (error) {
      setIsSubmitting(false);
      if (error.code === POSTGRES_UNIQUE_VIOLATION) {
        setErrorText(ko.onboarding.nicknameTaken);
      } else {
        setErrorText(ko.common.error);
      }
      return;
    }

    await refreshProfile();
    setIsSubmitting(false);
    router.replace("/");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{ko.onboarding.nicknameTitle}</Text>

      <TextInput
        style={styles.input}
        value={nickname}
        onChangeText={(text) => {
          setNickname(text);
          if (errorText) setErrorText(null);
        }}
        placeholder={ko.onboarding.nicknamePlaceholder}
        maxLength={20}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isSubmitting}
      />

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      <TouchableOpacity
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>{ko.onboarding.nicknameSubmit}</Text>
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
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 24,
  },
  input: {
    width: "100%",
    height: 52,
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 8,
  },
  errorText: {
    color: "#e0245e",
    fontSize: 13,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  button: {
    width: "100%",
    height: 52,
    borderRadius: 12,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  buttonDisabled: {
    backgroundColor: "#bbbbbb",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
