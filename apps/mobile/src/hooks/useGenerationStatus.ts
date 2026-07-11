import { useEffect, useState } from "react";
import type { GenerationJobRow } from "@daytale/shared";
import { supabase } from "@/lib/supabase";

/**
 * apps/mobile/src/hooks/useGenerationStatus.ts — OWNED BY WS-F (Generation UX).
 *
 * Subscribes (Supabase Realtime) to a single `generation_jobs` row's status
 * changes — the belt-and-suspenders channel alongside push notifications
 * (plan §2.1 step 4). Fetches the row once on mount/`jobId` change, then
 * layers live `UPDATE` events on top. Used by app/generate.tsx to render
 * queued/processing/awaiting_input/completed/failed status and drive the
 * clarify sub-flow (plan §2.2).
 */
export interface UseGenerationStatusResult {
  job: GenerationJobRow | null;
  isLoading: boolean;
  error: string | null;
}

export function useGenerationStatus(
  jobId: string | null
): UseGenerationStatusResult {
  const [job, setJob] = useState<GenerationJobRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    supabase
      .from("generation_jobs")
      .select("*")
      .eq("id", jobId)
      .single()
      .then(({ data, error: fetchError }) => {
        if (!isMounted) return;
        if (fetchError) {
          // eslint-disable-next-line no-console
          console.warn(
            "[useGenerationStatus] failed to fetch job",
            fetchError.message
          );
          setError(fetchError.message);
        } else {
          setJob(data);
        }
        setIsLoading(false);
      });

    const channel = supabase
      .channel(`generation_jobs:${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "generation_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          if (!isMounted) return;
          setJob(payload.new as GenerationJobRow);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { job, isLoading, error };
}
