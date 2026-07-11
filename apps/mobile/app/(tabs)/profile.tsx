import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useBlockedUsers, useUnblockUser } from "@/features/moderation/useModeration";
import { ko } from "@/i18n/ko";

/** Postgres unique-violation error code — see app/onboarding/nickname.tsx. */
const POSTGRES_UNIQUE_VIOLATION = "23505";

/**
 * app/(tabs)/profile.tsx — OWNED BY WS-I.
 *
 * Nickname display/edit (unique-checked UPDATE, same pattern as
 * app/onboarding/nickname.tsx), logout, and the blocked-users list/unblock
 * (plan §4, §6 "신고·차단 동작").
 */
export default function ProfileScreen() {
  const { session, profile, signOut, refreshProfile } = useAuth();
  const userId = session?.user.id ?? null;

  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nickname, setNickname] = useState("");
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  const blockedUsersQuery = useBlockedUsers(userId);
  const unblockMutation = useUnblockUser(userId);

  const startEditingNickname = () => {
    setNickname(profile?.nickname ?? "");
    setNicknameError(null);
    setIsEditingNickname(true);
  };

  const handleSaveNickname = async () => {
    const trimmed = nickname.trim();
    if (!session || trimmed.length === 0) return;

    setIsSavingNickname(true);
    setNicknameError(null);

    const { error } = await supabase
      .from("profiles")
      .update({ nickname: trimmed })
      .eq("id", session.user.id);

    if (error) {
      setIsSavingNickname(false);
      setNicknameError(
        error.code === POSTGRES_UNIQUE_VIOLATION ? ko.profile.nicknameTaken : ko.common.error
      );
      return;
    }

    await refreshProfile();
    setIsSavingNickname(false);
    setIsEditingNickname(false);
  };

  const handleLogout = () => {
    Alert.alert(ko.profile.logoutConfirm, undefined, [
      { text: ko.common.cancel, style: "cancel" },
      {
        text: ko.common.confirm,
        onPress: async () => {
          try {
            await signOut();
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[profile] logout failed", err);
            Alert.alert(ko.common.error, ko.profile.logoutFailed);
          }
        },
      },
    ]);
  };

  const handleUnblock = (blockedId: string) => {
    Alert.alert(ko.profile.unblockConfirm, undefined, [
      { text: ko.common.cancel, style: "cancel" },
      {
        text: ko.common.confirm,
        onPress: async () => {
          try {
            await unblockMutation.mutateAsync(blockedId);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[profile] unblock failed", err);
            Alert.alert(ko.common.error, ko.profile.unblockFailed);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{ko.profile.title}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{ko.profile.nicknameLabel}</Text>

        {isEditingNickname ? (
          <>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={(text) => {
                setNickname(text);
                if (nicknameError) setNicknameError(null);
              }}
              maxLength={20}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSavingNickname}
            />
            {nicknameError ? <Text style={styles.errorText}>{nicknameError}</Text> : null}
            <View style={styles.nicknameActions}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={() => setIsEditingNickname(false)}
                disabled={isSavingNickname}
              >
                <Text style={styles.secondaryButtonText}>{ko.common.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={handleSaveNickname}
                disabled={isSavingNickname || nickname.trim().length === 0}
              >
                {isSavingNickname ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>{ko.common.save}</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.nicknameDisplay}>
            <Text style={styles.nicknameText}>{profile?.nickname ?? ""}</Text>
            <TouchableOpacity onPress={startEditingNickname}>
              <Text style={styles.editLink}>{ko.profile.editNickname}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>{ko.auth.logout}</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{ko.profile.blockedUsersTitle}</Text>

        {blockedUsersQuery.isLoading ? (
          <ActivityIndicator />
        ) : blockedUsersQuery.isError ? (
          <Text style={styles.errorText}>{ko.profile.loadFailed}</Text>
        ) : (blockedUsersQuery.data ?? []).length === 0 ? (
          <Text style={styles.emptyText}>{ko.profile.blockedUsersEmpty}</Text>
        ) : (
          <View style={styles.blockedList}>
            {(blockedUsersQuery.data ?? []).map((item) => (
              <View key={item.blocked_id} style={styles.blockedRow}>
                <Text style={styles.blockedNickname}>
                  {item.profile?.nickname ?? ko.feed.unknownAuthor}
                </Text>
                <TouchableOpacity
                  onPress={() => handleUnblock(item.blocked_id)}
                  disabled={unblockMutation.isPending}
                >
                  <Text style={styles.unblockLink}>{ko.profile.unblock}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 24,
  },
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999999",
    marginBottom: 10,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 8,
  },
  errorText: {
    color: "#e0245e",
    fontSize: 13,
    marginBottom: 8,
  },
  nicknameActions: {
    flexDirection: "row",
    gap: 10,
  },
  nicknameDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nicknameText: {
    fontSize: 18,
    fontWeight: "600",
  },
  editLink: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3366cc",
  },
  button: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#000000",
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#f0f0f0",
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f1f1f",
  },
  logoutButton: {
    backgroundColor: "#f0f0f0",
    marginBottom: 28,
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#e0245e",
  },
  blockedList: {
    gap: 12,
  },
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f7f7f7",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  blockedNickname: {
    fontSize: 15,
    color: "#333333",
  },
  unblockLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#777777",
  },
  emptyText: {
    fontSize: 14,
    color: "#999999",
  },
});
