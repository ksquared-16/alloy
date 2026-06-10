/**
 * Status/disposition options for Lifecycle Builder queue_membership_v1 editor.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { OPPORTUNITY_CASE_STATUS_KEYS } from "@/lib/admin/statusReseed/statusMvpCatalog";
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
        const filtered = rows.filter((r) => {
            if (OPPORTUNITY_CASE_STATUS_KEYS.has(r.status_key)) return true;
            const meta =
                r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                    ? (r.metadata as Record<string, unknown>)
                    : null;
            const operator = parseEnrollmentOperatorStageFromMetadata(meta);
            if (operator && operator !== "unassigned") {
                return normalizeBuilderStageKey(operator) === normalizeBuilderStageKey(stageKey);
            }
            return false;
        });
        return mapRows(filtered);
    }

    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunity_customer_members", {
        activeOnly: true,
    });
    const filtered = rows.filter((r) => {
        const meta =
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : null;
        if (meta?.alloy_layer === "enrollment_disposition") {
            return dispositionMatchesStage(meta, stageKey);
        }
        return dispositionMatchesStage(meta, stageKey);
    });

    if (filtered.length) return mapRows(filtered);

    return mapRows(rows);
}
