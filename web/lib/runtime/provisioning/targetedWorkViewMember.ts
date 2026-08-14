/**
 * TARGETED MEMBER RESOLUTION — is this named record a MEMBER of the lens, regardless of page?
 *
 * ── THE QUESTION THAT WAS BEING ANSWERED WRONG ──
 *
 * The provisioning answer publishes a PAGE, capped at `PROVISIONING_ROW_PAGE_CAP`. Its selection
 * guard resolved a named `subject_id` against that page — which answers
 *
 *     "is this record in the Work View?"
 *
 * with
 *
 *     "is it in the first 100 rows?"
 *
 * Those are different questions, and for a lens holding more members than the cap they give different
 * answers. A truthful member sorted past the cap was refused as `subject_unavailable` and could not be
 * reached by direct navigation at all — the operator was told a record was not in a view that does
 * contain it.
 *
 * ── WHY THIS COSTS NOTHING ──
 *
 * The complete membership is ALREADY in memory when the guard runs: `childRows` is the lens's full
 * member set (the child provider returns every live participation — `countChildGrainMembersForLens`
 * literally counts `rows.length`), and the family projection is the full ordered result before the
 * slice. So this reads what the lens already evaluated. No query, no larger page, no prefetch.
 *
 * ── WHAT THIS IS NOT ──
 *
 * It is NOT a weakening of the membership guard, and it never substitutes. An id naming no member of
 * this lens still resolves to `null` and the caller still refuses. The ONLY thing that widens is the
 * selectability of a member the lens genuinely contains.
 *
 * The published page is deliberately untouched: what the surface DISPLAYS and what the lens CONTAINS
 * are separate facts, and conflating them is the defect.
 */

import type { OperationalProjectionRow } from "@/lib/lifecycle/operationalProjection";
import type { ChildProvisioningRow } from "@/lib/runtime/provisioning/childGrainProvisioningRows";
import type { OperationalSubjectQueueRow } from "@/lib/adminV2/runtime/operationalSubject/resolveDefaultOperationalSubject";

/**
 * Resolve a named subject against the lens's COMPLETE membership.
 *
 * Grain decides the identity, exactly as the published rows do:
 *   child   → `participationId` (`process_instances.id`)
 *   family  → the row's `id` (`opportunities.id`)
 *
 * `sortIndex` is the member's true position in the ordered membership, so next/previous and any
 * position-dependent presentation stay honest about where the operator actually is.
 *
 * Returns `null` for a non-member — the caller's fail-closed refusal is unchanged.
 */
export function resolveTargetedWorkViewMember(params: {
    /** The lens's full child membership, when the lens is child-grain. */
    childRows: readonly ChildProvisioningRow[] | null;
    /** The lens's full ordered family projection, when the lens is family-grain. */
    familyMembership: readonly OperationalProjectionRow[];
    subjectId: string;
}): OperationalSubjectQueueRow | null {
    const subjectId = (params.subjectId ?? "").trim();
    if (!subjectId) return null;

    if (params.childRows) {
        const index = params.childRows.findIndex(
            (row) => String(row.participationId ?? "") === subjectId,
        );
        if (index < 0) return null;
        return { id: subjectId, entityId: subjectId, entityType: "child", sortIndex: index };
    }

    const index = params.familyMembership.findIndex(
        (row) => String((row as Record<string, unknown>).id) === subjectId,
    );
    if (index < 0) return null;
    return { id: subjectId, entityId: subjectId, entityType: "opportunity", sortIndex: index };
}
