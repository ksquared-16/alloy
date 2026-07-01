/**
 * Persist status_definitions process_stage_key for one builder stage.
 * Shared by status-stages PATCH and saveLifecycleStageRuntimeConfig.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { normalizeStatusDefinitionMetadata } from "@/lib/admin/normalizeStatusMetadata";
import {
    mergeProcessStageMetadata,
    parseProcessStageKeyFromStatusMetadata,
    PROCESS_STAGE_UNASSIGNED,
} from "@/lib/businessProcesses/processStageMetadata";
import { ensureOrgOpportunityStatusRow } from "@/lib/lifecycle/ensureOrgOpportunityStatus";
import type { StageStatusEntityType } from "@/lib/lifecycle/stageStatusRollup";

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

async function ensureOrgStatusRow(
    supabase: SupabaseClient,
    orgId: string,
    entityType: StageStatusEntityType,
    statusKey: string,
    effectiveRow: StatusDefinitionRow
): Promise<{ id: string; metadata: Record<string, unknown> }> {
    if (entityType === "opportunities") {
        return ensureOrgOpportunityStatusRow(supabase, orgId, statusKey, effectiveRow);
    }

    const { data: existing } = await supabase
        .from("status_definitions")
        .select("id, metadata")
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .eq("status_key", statusKey)
        .maybeSingle();

    if (existing?.id) {
        const metadata =
            existing.metadata !== null &&
            typeof existing.metadata === "object" &&
            !Array.isArray(existing.metadata)
                ? (existing.metadata as Record<string, unknown>)
                : {};
        return { id: existing.id as string, metadata };
    }

    const insert = {
        org_id: orgId,
        entity_type: entityType,
        status_key: statusKey,
        status_label: effectiveRow.status_label,
        sort_order: effectiveRow.sort_order,
        is_active: effectiveRow.is_active,
        is_system: false,
        industry_key: null as string | null,
        metadata: normalizeStatusDefinitionMetadata(effectiveRow.metadata ?? {}),
    };

    const { data: created, error } = await supabase
        .from("status_definitions")
        .insert(insert)
        .select("id, metadata")
        .single();

    if (error) {
        throw new Error(error.message);
    }

    const metadata =
        created.metadata !== null && typeof created.metadata === "object" && !Array.isArray(created.metadata)
            ? (created.metadata as Record<string, unknown>)
            : {};
    return { id: created.id as string, metadata };
}

export async function persistStageStatusAssignments(
    supabase: SupabaseClient,
    orgId: string,
    stageKey: string,
    statusKeys: readonly string[],
    entityType: StageStatusEntityType
): Promise<{ changedIds: string[] }> {
    const stage = stageKey.trim();
    const desiredKeys = assertValidEnrollmentStageStatusKeys(statusKeys);
    const desired = new Set(desiredKeys);

    const effective = await fetchEffectiveStatusDefinitions(supabase, orgId, entityType, {
        activeOnly: false,
    });
    const byKey = new Map(effective.map((r) => [r.status_key, r]));

    const { data: orgRows } = await supabase
        .from("status_definitions")
        .select("id, status_key, metadata")
        .eq("org_id", orgId)
        .eq("entity_type", entityType);

    const changedIds: string[] = [];

    for (const key of desiredKeys) {
        const eff = byKey.get(key);
        if (!eff) {
            throw new Error(`Unknown status: ${key}`);
        }
        const org = await ensureOrgStatusRow(supabase, orgId, entityType, key, eff);
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

/** @deprecated Use {@link persistStageStatusAssignments} with explicit entity type. */
export async function persistEnrollmentStageStatusAssignments(
    supabase: SupabaseClient,
    orgId: string,
    stageKey: string,
    statusKeys: readonly string[]
): Promise<{ changedIds: string[] }> {
    return persistStageStatusAssignments(supabase, orgId, stageKey, statusKeys, "opportunities");
}
