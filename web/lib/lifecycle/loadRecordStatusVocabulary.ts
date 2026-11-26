/**
 * The record-status vocabulary a transition may write.
 *
 * WHY THIS IS NOT `loadQueueMembershipStatusOptions`
 *
 * Two different questions were being answered by one list, and the wrong one won:
 *
 *   queue membership          "which statuses put a record IN this stage's queue?"
 *                             disposition layer, filtered per stage, and it deliberately DROPS
 *                             `alloy_layer === "case_status"` rows
 *
 *   transition status effect  "which status does this movement WRITE onto the record?"
 *                             the durable case container — `opportunities.status_key ∈ {open, closed}`
 *
 * The Stage editor validated the second against the first. Because the queue filter removes
 * case-layer rows by design, every canonical transition status was unreachable: a seed carrying
 * the correct `status_key: "closed"` was rejected as non-canonical, and so was `"open"`. The
 * status keys were never wrong — they were being checked against a catalog that structurally
 * could not contain them.
 *
 * That is why the seed must not be edited to make this pass. `open` and `closed` are present in
 * `status_definitions`, active, and correct; stripping them would have hidden a delivery defect
 * and left the editor unable to express a valid transition at all. The same reasoning is why the
 * second defect — see `isRecordStatusRow` below, where this file's own membership test had gone
 * stale against the seed — was fixed here rather than by relabelling the rows.
 *
 * OWNERSHIP
 *
 * A transition's `status_key` is owned by the lead/case container status catalog of the process's
 * primary entity — not by the source stage, not by the destination stage, and not by the
 * transition. The transition only selects from it. Membership in that catalog is decided by one
 * predicate, `isLeadCaseContainerStatusRow`, shared with Organization → Statuses; this file must
 * never grow a private second opinion about it. `metadata` is carried through untouched because
 * closure (`terminal` / `is_terminal`) lives there, and dropping it makes `closes_record`
 * unverifiable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { isLeadCaseContainerStatusRow } from "@/lib/lifecycle/statusSettingsCategoryDoctrine";
import type { OutcomeStatusConfiguredRow } from "@/lib/lifecycle/resolveOutcomeStatusOptions";

type RecordStatusCandidate = {
    status_key: string;
    status_label?: string | null;
    is_active?: boolean | null;
    metadata?: unknown;
};

function candidateMetadata(row: RecordStatusCandidate): Record<string, unknown> | null {
    const meta = row.metadata;
    return meta != null && typeof meta === "object" && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : null;
}

function isOpportunityGrain(entityType: string): boolean {
    const t = entityType.trim().toLowerCase();
    return t === "opportunities" || t === "opportunity";
}

/**
 * WHY THE LAYER LITERAL IS GONE
 *
 * This filter used to be `metadata.alloy_layer === "case_status"`. That literal was written
 * against the seed generation that stamped it, and the S4 status collapse
 * (`20260711000100_enrollment_status_collapse_and_stage_key.sql`) then overwrote `alloy_layer`
 * on `opportunities.open` / `opportunities.closed` to `enrollment_process`. From that migration
 * onward the loader silently dropped the two canonical case statuses it exists to return: the
 * Stage editor was handed only `inactive` / `archived`, neither of which closes anything, and
 * reported "no closed lead status values are configured" about a `closed` status that was
 * present, active, and correct.
 *
 * Layer labels are seed-generation trivia. Membership in the lead/case container domain is the
 * real question, and `isLeadCaseContainerStatusRow` is the one canonical answer to it — the same
 * predicate Organization → Statuses uses to decide what appears under "lead status". Reusing it
 * is what makes the editor and the page the warning points operators at agree by construction,
 * and it accepts the historical `case_status` shape and the current `enrollment_process` shape
 * alike, so no data has to be rewritten to make either work.
 */
function isRecordStatusRow(row: RecordStatusCandidate, entityType: string): boolean {
    if (!isOpportunityGrain(entityType)) {
        // Non-opportunity grains keep the historical layer test verbatim. The child enrollment
        // track (`opportunity_customer_members`) is owned by `outcome_status_key`, not by this
        // vocabulary, and must not start resolving rows it never resolved before.
        return candidateMetadata(row)?.alloy_layer === "case_status";
    }
    return isLeadCaseContainerStatusRow({
        entity_type: "opportunities",
        status_key: row.status_key,
        metadata: candidateMetadata(row),
    } as StatusDefinitionRow);
}

/** Rows that carry the durable record status for the grain, not a queue disposition. */
export function selectRecordStatusRows(
    rows: ReadonlyArray<RecordStatusCandidate>,
    entityType: string,
): OutcomeStatusConfiguredRow[] {
    return rows
        .filter((row) => {
            if (!row.status_key?.trim()) return false;
            if (row.is_active === false) return false;
            return isRecordStatusRow(row, entityType);
        })
        .map((row) => ({
            status_key: row.status_key,
            status_label: row.status_label ?? row.status_key,
            entity_type: entityType,
            is_active: true,
            // Closure lives in metadata. Carrying it is what makes `closes_record` checkable.
            metadata: (row.metadata ?? null) as Record<string, unknown> | null,
        }));
}

export async function loadRecordStatusVocabulary(
    supabase: SupabaseClient,
    orgId: string,
    entityType = "opportunities",
): Promise<OutcomeStatusConfiguredRow[]> {
    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, entityType, {
        activeOnly: true,
    });
    return selectRecordStatusRows(rows, entityType);
}
