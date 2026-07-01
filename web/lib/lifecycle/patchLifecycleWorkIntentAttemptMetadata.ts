/**
 * Record a non-terminal stage outcome attempt on open lifecycle work intent metadata.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOperationalTaskById } from "@/lib/admin/operationalTasksService";

export type PatchLifecycleWorkIntentAttemptMetadataInput = {
    supabase: SupabaseClient;
    orgId: string;
    workId: string;
    outcomeKey: string;
    outcomeLabel: string;
    now?: Date;
};

export type PatchLifecycleWorkIntentAttemptMetadataResult =
    | { ok: true; attempt_count: number }
    | { ok: false; error: string };

function readAttemptCount(metadata: Record<string, unknown>): number {
    const raw = metadata.attempt_count;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
        return Math.floor(raw);
    }
    if (typeof raw === "string" && raw.trim()) {
        const parsed = Number.parseInt(raw.trim(), 10);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return 0;
}

export async function patchLifecycleWorkIntentAttemptMetadata(
    input: PatchLifecycleWorkIntentAttemptMetadataInput,
): Promise<PatchLifecycleWorkIntentAttemptMetadataResult> {
    const workId = input.workId.trim();
    const outcomeKey = input.outcomeKey.trim();
    const outcomeLabel = input.outcomeLabel.trim();
    if (!workId || !outcomeKey) {
        return { ok: false, error: "workId and outcomeKey are required" };
    }

    const loaded = await getOperationalTaskById({
        supabase: input.supabase,
        orgId: input.orgId,
        taskId: workId,
    });
    if (!loaded.ok) {
        return { ok: false, error: loaded.message ?? loaded.error };
    }
    if (loaded.row.status !== "open") {
        return { ok: false, error: "Only open work can record retry attempts" };
    }

    const existingMetadata =
        loaded.row.metadata != null && typeof loaded.row.metadata === "object" && !Array.isArray(loaded.row.metadata)
            ? (loaded.row.metadata as Record<string, unknown>)
            : {};

    const attempt_count = readAttemptCount(existingMetadata) + 1;
    const last_outcome_at = (input.now ?? new Date()).toISOString();
    const mergedMetadata: Record<string, unknown> = {
        ...existingMetadata,
        attempt_count,
        last_outcome_key: outcomeKey,
        last_outcome_label: outcomeLabel || outcomeKey,
        last_outcome_at,
    };

    const { data, error } = await input.supabase
        .from("operational_tasks")
        .update({ metadata: mergedMetadata })
        .eq("org_id", input.orgId)
        .eq("id", workId)
        .eq("status", "open")
        .select("id")
        .maybeSingle();

    if (error || !data) {
        return { ok: false, error: error?.message ?? "Failed to update work attempt metadata" };
    }

    return { ok: true, attempt_count };
}
