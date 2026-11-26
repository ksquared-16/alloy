/**
 * Personal seen/unseen for queue stage-membership occurrences.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildStageMembershipOccurrenceKey } from "@/lib/lifecycle/operationalStateEnteredAt";

export const OPERATOR_STAGE_MEMBERSHIP_ACKS_TABLE = "operator_stage_membership_acks" as const;

export type StageMembershipAckInput = {
    orgId: string;
    userId: string;
    subjectType: string;
    subjectId: string;
    stageKey: string;
    stageEnteredAtIso: string;
};

export function occurrenceKeyForAck(input: StageMembershipAckInput): string {
    return buildStageMembershipOccurrenceKey({
        orgId: input.orgId,
        userId: input.userId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        stageKey: input.stageKey,
        stageEnteredAtIso: input.stageEnteredAtIso,
    });
}

/** Idempotent upsert — repeated opens of the same membership do not create duplicates. */
export async function acknowledgeStageMembershipSeen(
    supabase: SupabaseClient,
    input: StageMembershipAckInput,
    seenAtIso: string = new Date().toISOString(),
): Promise<{ occurrenceKey: string; error?: string }> {
    const occurrenceKey = occurrenceKeyForAck(input);
    const { error } = await supabase.from(OPERATOR_STAGE_MEMBERSHIP_ACKS_TABLE).upsert(
        {
            org_id: input.orgId,
            user_id: input.userId,
            subject_type: input.subjectType,
            subject_id: input.subjectId,
            stage_key: input.stageKey,
            stage_entered_at: input.stageEnteredAtIso,
            occurrence_key: occurrenceKey,
            seen_at: seenAtIso,
        },
        { onConflict: "org_id,occurrence_key", ignoreDuplicates: false },
    );
    if (error) return { occurrenceKey, error: error.message };
    return { occurrenceKey };
}

/** Load occurrence keys the current user has already acknowledged (for queue hydration). */
export async function loadAcknowledgedOccurrenceKeys(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    occurrenceKeys: readonly string[];
}): Promise<Set<string>> {
    const out = new Set<string>();
    const keys = [...new Set(params.occurrenceKeys.map((k) => k.trim()).filter(Boolean))];
    if (!keys.length) return out;

    const { data, error } = await params.supabase
        .from(OPERATOR_STAGE_MEMBERSHIP_ACKS_TABLE)
        .select("occurrence_key")
        .eq("org_id", params.orgId)
        .eq("user_id", params.userId)
        .in("occurrence_key", keys as string[]);

    if (error || !data) return out;
    for (const row of data) {
        const key = String((row as { occurrence_key?: string }).occurrence_key ?? "").trim();
        if (key) out.add(key);
    }
    return out;
}

export function personalSeenFromOccurrence(params: {
    occurrenceKey: string | null;
    acknowledgedKeys: ReadonlySet<string>;
    /** Local optimistic clears — win over stale queue payloads. */
    locallySeenKeys?: ReadonlySet<string>;
}): { unseen: boolean; occurrence_key: string | null } {
    const key = params.occurrenceKey?.trim() || null;
    if (!key) {
        // Without a stable occurrence we cannot claim unseen — avoid false dots.
        return { unseen: false, occurrence_key: null };
    }
    if (params.locallySeenKeys?.has(key)) {
        return { unseen: false, occurrence_key: key };
    }
    return { unseen: !params.acknowledgedKeys.has(key), occurrence_key: key };
}
