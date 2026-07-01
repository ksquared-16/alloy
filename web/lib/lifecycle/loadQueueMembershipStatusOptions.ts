/**
 * Status/disposition options for Lifecycle Builder queue_membership_v1 editor.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { legacyOcmDispositionKeysForStage } from "@/lib/businessProcessTemplates/enrollmentLegacyCompat";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import { parseProcessStageKeyFromStatusMetadata } from "@/lib/businessProcesses/processStageMetadata";
import {
    isGenericEnrollmentCaseContainerStatus,
} from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import { parseEnrollmentOperatorStageFromMetadata } from "@/lib/lifecycle/enrollmentOperatorStage";
import type { QueueMembershipSubjectType } from "@/lib/lifecycle/queueMembershipV1";

export type QueueMembershipStatusOption = {
    status_key: string;
    status_label: string;
    sort_order: number;
};

function mapRows(
    rows: Awaited<ReturnType<typeof fetchEffectiveStatusDefinitions>>,
): QueueMembershipStatusOption[] {
    return rows
        .filter((r) => r.is_active !== false)
        .map((r) => ({
            status_key: r.status_key,
            status_label:
                (r.status_label && String(r.status_label).trim()) ||
                r.status_key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            sort_order: Number(r.sort_order) ?? 100,
        }))
        .sort((a, b) => a.sort_order - b.sort_order || a.status_label.localeCompare(b.status_label));
}

function enrollmentStageKeyFromMetadata(metadata: Record<string, unknown> | null): string | null {
    if (!metadata) return null;
    const processStage = parseProcessStageKeyFromStatusMetadata(metadata);
    if (processStage && processStage !== "unassigned") {
        return processStage === "enrollment" ? "enrollment" : processStage;
    }
    const stage =
        (typeof metadata.enrollment_stage_key === "string" && metadata.enrollment_stage_key.trim()) ||
        (typeof metadata.stage_key === "string" && metadata.stage_key.trim()) ||
        null;
    if (stage) return stage === "enrollment" ? "enrollment" : stage;
    const operator = parseEnrollmentOperatorStageFromMetadata(metadata);
    if (operator && operator !== "unassigned") {
        return operator === "enrollment" ? "enrollment" : operator;
    }
    return null;
}

function templateStatusKeysForStage(stageKey: string, includeLegacyOcmKeys: boolean): Set<string> {
    const spec = defaultEnrollmentQueueMembershipForStage(stageKey);
    const keys = [
        ...(spec?.included_disposition_keys ?? []),
        ...(spec?.included_status_keys ?? []),
        ...(includeLegacyOcmKeys ? legacyOcmDispositionKeysForStage(stageKey) : []),
    ];
    return new Set(keys.map((k) => k.trim()).filter(Boolean));
}

function statusMetadataRecord(row: StatusDefinitionRow): Record<string, unknown> | null {
    return row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
}

/** Pure filter for family-track lead pipeline status picker rows (unit-tested). */
export function filterFamilyTrackStatusRowsForStage(
    rows: readonly StatusDefinitionRow[],
    builderStageKey: string,
): StatusDefinitionRow[] {
    const stageKey = builderStageKey.trim();
    if (!stageKey) return [];

    const templateKeys = templateStatusKeysForStage(stageKey, false);
    const filtered = rows.filter((r) => {
        if (r.is_active === false) return false;
        const meta = statusMetadataRecord(r);
        if (isGenericEnrollmentCaseContainerStatus(r.status_key, meta)) return false;
        if (meta?.excluded_from_enrollment_stage_picker === true) return false;
        if (templateKeys.has(r.status_key)) return true;
        if (!meta) return false;
        if (meta.alloy_layer === "case_status") return false;
        return dispositionMatchesStage(meta, stageKey);
    });

    return filtered.length ? filtered : rows.filter((r) => r.is_active !== false && templateKeys.has(r.status_key));
}

/** Pure filter for child-track enrollment disposition picker rows (unit-tested). */
export function filterEnrollmentTrackStatusRowsForStage(
    rows: readonly StatusDefinitionRow[],
    builderStageKey: string,
): StatusDefinitionRow[] {
    const stageKey = builderStageKey.trim();
    if (!stageKey) return [];

    const templateKeys = templateStatusKeysForStage(stageKey, true);
    const filtered = rows.filter((r) => {
        if (r.is_active === false) return false;
        if (templateKeys.has(r.status_key)) return true;
        const meta = statusMetadataRecord(r);
        if (!meta) return false;
        if (meta.alloy_layer != null && meta.alloy_layer !== "enrollment_disposition") return false;
        return dispositionMatchesStage(meta, stageKey);
    });

    return filtered.length ? filtered : rows.filter((r) => r.is_active !== false && templateKeys.has(r.status_key));
}

function normalizeBuilderStageKey(stageKey: string): string {
    const sk = stageKey.trim();
    if (sk === "enrolling") return "enrollment";
    return sk;
}

function dispositionMatchesStage(
    metadata: Record<string, unknown> | null,
    builderStageKey: string,
): boolean {
    const stage = enrollmentStageKeyFromMetadata(metadata);
    if (!stage) return false;
    return normalizeBuilderStageKey(stage) === normalizeBuilderStageKey(builderStageKey);
}

/** Load selectable status keys for queue membership editor by subject grain. */
export async function loadQueueMembershipStatusOptions(
    supabase: SupabaseClient,
    orgId: string,
    subjectType: QueueMembershipSubjectType,
    builderStageKey: string,
): Promise<QueueMembershipStatusOption[]> {
    const stageKey = builderStageKey.trim();
    if (!stageKey) return [];

    if (subjectType === "case") {
        const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", {
            activeOnly: true,
        });
        return mapRows(filterFamilyTrackStatusRowsForStage(rows, stageKey));
    }

    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunity_customer_members", {
        activeOnly: true,
    });
    return mapRows(filterEnrollmentTrackStatusRowsForStage(rows, stageKey));
}
