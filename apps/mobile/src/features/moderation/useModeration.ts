import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicProfileRow, ReportTargetType } from "@daytale/shared";
import { supabase } from "@/lib/supabase";

/**
 * apps/mobile/src/features/moderation/useModeration.ts — OWNED BY WS-I (Moderation).
 *
 * Data/mutations backing app/episode/[id].tsx (report/block actions) and
 * app/(tabs)/profile.tsx (blocked-users list/unblock) — plan §1.5
 * `reports`/`blocks`, §4, §6 "신고·차단 동작". RLS (`reports_owner_all`,
 * `blocks_owner_all`) already scopes reads/writes to the caller's own rows.
 */

const POSTGRES_UNIQUE_VIOLATION = "23505";

export const blockedUsersKey = (userId: string) => ["moderation", "blockedUsers", userId];

export function useReportEpisode(episodeId: string | undefined) {
  return useMutation({
    mutationFn: async (params: { reporterId: string; reason: string | null }) => {
      if (!episodeId) throw new Error("missing episode id");

      const { error } = await supabase.from("reports").insert({
        reporter_id: params.reporterId,
        target_type: "episode" satisfies ReportTargetType,
        target_id: episodeId,
        reason: params.reason,
      });

      if (error) throw error;
    },
  });
}

export function useBlockUser(blockerId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blockedId: string): Promise<{ alreadyBlocked: boolean }> => {
      if (!blockerId) throw new Error("missing blocker id");

      const { error } = await supabase
        .from("blocks")
        .insert({ blocker_id: blockerId, blocked_id: blockedId });

      if (error) {
        if (error.code === POSTGRES_UNIQUE_VIOLATION) return { alreadyBlocked: true };
        throw error;
      }

      return { alreadyBlocked: false };
    },
    onSuccess: () => {
      if (blockerId) void queryClient.invalidateQueries({ queryKey: blockedUsersKey(blockerId) });
    },
  });
}

export type BlockedUserRow = {
  blocked_id: string;
  created_at: string;
  profile: PublicProfileRow | null;
};

export function useBlockedUsers(userId: string | null) {
  return useQuery({
    queryKey: blockedUsersKey(userId ?? ""),
    enabled: !!userId,
    queryFn: async (): Promise<BlockedUserRow[]> => {
      const { data: blocks, error } = await supabase
        .from("blocks")
        .select("blocked_id, created_at")
        .eq("blocker_id", userId as string)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (blocks.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("public_profiles")
        .select("*")
        .in(
          "id",
          blocks.map((b) => b.blocked_id)
        );

      if (profilesError) throw profilesError;

      const profileById = new Map(profiles.map((p) => [p.id, p]));
      return blocks.map((b) => ({
        blocked_id: b.blocked_id,
        created_at: b.created_at,
        profile: profileById.get(b.blocked_id) ?? null,
      }));
    },
  });
}

export function useUnblockUser(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blockedId: string) => {
      if (!userId) throw new Error("missing user id");

      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", userId)
        .eq("blocked_id", blockedId);

      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: blockedUsersKey(userId) });
    },
  });
}
