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
 *                             exactly the case layer — `opportunities.status_key ∈ {open, closed}`
 *
 * The Stage editor validated the second against the first. Because the queue filter removes
 * case-layer rows by design, every canonical transition status was unreachable: a seed carrying
 * the correct `status_key: "closed"` was rejected as non-canonical, and so was `"open"`. The
 * status keys were never wrong — they were being checked against a catalog that structurally
 * could not contain them.
 *
 * That is why the seed must not be edited to make this pass. `open` and `closed` are present in
 * `status_definitions`, active, and correct; stripping them would have hidden a delivery defect
 * and left the editor unable to express a valid transition at all.
 *
 * OWNERSHIP
 *
 * A transition's `status_key` is owned by the CASE-LAYER status catalog of the process's primary
 * entity — not by the source stage, not by the destination stage, and not by the transition. The
 * transition only selects from it. `metadata` is carried through untouched because closure
 * (`terminal` / `is_terminal`) lives there, and dropping it makes `closes_record` unverifiable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import type { OutcomeStatusConfiguredRow } from "@/lib/lifecycle/resolveOutcomeStatusOptions";

/** Rows whose `alloy_layer` marks them as the durable record status, not a queue disposition. */
export function selectRecordStatusRows(
    rows: ReadonlyArray<{
        status_key: string;
        status_label?: string | null;
        is_active?: boolean | null;
        metadata?: unknown;
    }>,
    entityType: string,
): OutcomeStatusConfiguredRow[] {
    return rows
        .filter((row) => {
            if (!row.status_key?.trim()) return false;
            if (row.is_active === false) return false;
            const meta = row.metadata;
            const layer =
                meta && typeof meta === "object"
                    ? (meta as Record<string, unknown>).alloy_layer
                    : undefined;
            return layer === "case_status";
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
