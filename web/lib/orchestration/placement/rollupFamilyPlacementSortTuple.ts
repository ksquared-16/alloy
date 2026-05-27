import {
    computeFamilyPlacementRollup,
    type FamilyRollupCandidateEval,
} from "@/lib/orchestration/placement/computeFamilyPlacementRollup";

/**
 * `family_row` projection rollup — delegates to {@link computeFamilyPlacementRollup}.
 * Independent/preferred: best (min) tuple; strictly_together groups: worst (max) within group, then min across units.
 */
export function pickFamilyRollupSortTuple(
    evaluations: Array<{ candidateId: string; sortTuple: Array<string | number | null> }>
): Array<string | number | null> | null {
    if (!evaluations.length) return null;
    const inputs: FamilyRollupCandidateEval[] = evaluations.map((e) => ({
        candidateId: e.candidateId,
        bucket_key: "",
        sortTuple: e.sortTuple,
        link_mode: "independent",
        link_group_id: null,
        link_group_member_count: 0,
    }));
    return computeFamilyPlacementRollup(inputs)?.sort_tuple ?? null;
}
