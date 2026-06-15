/**
 * Persist opportunity status_definitions process_stage_key for one builder stage.
 * Shared by status-stages PATCH and saveLifecycleStageRuntimeConfig.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { normalizeStatusDefinitionMetadata } from "@/lib/admin/normalizeStatusMetadata";
import {
    mergeProcessStageMetadata,
    parseProcessStageKeyFromStatusMetadata,
    PROCESS_STAGE_UNASSIGNED,
} from "@/lib/businessProcesses/processStageMetadata";
import { ensureOrgOpportunityStatusRow } from "@/lib/lifecycle/ensureOrgOpportunityStatus";

export const ENROLLMENT_STAGE_STATUS_KEY_REGEX = /^[a-z0-9_]{2,32}$/;

export function normalizeEnrollmentStageStatusKeys(keys: readonly string[]): string[] {
    return [
        ...new Set(
            keys.map((k) => String(k ?? "").trim().toLowerCase()).filter(Boolean)
        ),
    ];
}

export function assertValidEnrollmentStageStatusKeys(statusKeys: readonly string[]): string[] {
    const normalized = normalizeEnrollmentStageStatusKeys(statusKeys);
    if (!normalized.length) {
        throw new Error("At least one status key is required.");
    }
    for (const k of normalized) {
        if (!ENROLLMENT_STAGE_STATUS_KEY_REGEX.test(k)) {
            throw new Error(`Invalid status key: ${k}`);
        }
    }
    return normalized;
}

export async function persistEnrollmentStageStatusAssignments(
    supabase: SupabaseClient,
    orgId: string,
    stageKey: string,
    statusKeys: readonly string[]
): Promise<{ changedIds: string[] }> {
    const stage = stageKey.trim();
    const desiredKeys = assertValidEnrollmentStageStatusKeys(statusKeys);
    const desired = new Set(desiredKeys);

    const effective = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", {
        activeOnly: false,
    });
    const byKey = new Map(effective.map((r) => [r.status_key, r]));

    const { data: orgRows } = await supabase
        .from("status_definitions")
        .select("id, status_key, metadata")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities");

    const changedIds: string[] = [];

    for (const key of desiredKeys) {
        const eff = byKey.get(key);
        if (!eff) {
            throw new Error(`Unknown status: ${key}`);
        }
        const org = await ensureOrgOpportunityStatusRow(supabase, orgId, key, eff);
        const merged = mergeProcessStageMetadata(org.metadata, stage);
        const { error } = await supabase
            .from("status_definitions")
            .update({ metadata: normalizeStatusDefinitionMetadata(merged) })
            .eq("id", org.id)
            .eq("org_id", orgId);
        if (error) throw new Error(error.message);
        changedIds.push(org.id);
    }

    for (const row of orgRows ?? []) {
        const key = String(row.status_key);
        const meta =
            row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        const assigned = parseProcessStageKeyFromStatusMetadata(meta);
        if (assigned !== stage) continue;
        if (desired.has(key)) continue;

        const nextMeta = mergeProcessStageMetadata(meta, PROCESS_STAGE_UNASSIGNED);
        const { error } = await supabase
            .from("status_definitions")
            .update({ metadata: normalizeStatusDefinitionMetadata(nextMeta) })
            .eq("id", row.id)
            .eq("org_id", orgId);
        if (error) throw new Error(error.message);
        changedIds.push(String(row.id));
    }

    return { changedIds };
}
