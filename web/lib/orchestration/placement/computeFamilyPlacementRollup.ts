import { comparePlacementSortTuples } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import type { PlacementLinkMode } from "@/lib/orchestration/placement/placementCandidateTypes";

export type FamilyRollupCandidateEval = {
    candidateId: string;
    bucket_key: string;
    sortTuple: Array<string | number | null>;
    link_mode: PlacementLinkMode;
    link_group_id: string | null;
    link_group_member_count: number;
};

export type FamilyPlacementRollup = {
    bucket: string;
    sort_tuple: Array<string | number | null>;
    blocked_by_strict_link: boolean;
    /** True when a strict link group has members on other opportunities (not loaded in this rollup). */
    strict_link_cross_opportunity_incomplete: boolean;
    candidate_count: number;
    representative_candidate_id: string;
};

function maxSortTuple(tuples: Array<Array<string | number | null>>): Array<string | number | null> | null {
    if (!tuples.length) return null;
    let best = tuples[0]!;
    for (let i = 1; i < tuples.length; i++) {
        const cur = tuples[i]!;
        if (comparePlacementSortTuples(cur, best) > 0) best = cur;
    }
    return best;
}

function minSortTuple(
    units: Array<{ sortTuple: Array<string | number | null>; candidateId: string; bucket: string }>
): { sortTuple: Array<string | number | null>; candidateId: string; bucket: string } | null {
    if (!units.length) return null;
    let best = units[0]!;
    for (let i = 1; i < units.length; i++) {
        const cur = units[i]!;
        if (comparePlacementSortTuples(cur.sortTuple, best.sortTuple) < 0) best = cur;
    }
    return best;
}

/**
 * Family-row rollup for queue ordering (Card 3).
 * - independent / preferred_together: each candidate is its own unit (best = min tuple).
 * - strictly_together: group members on this opportunity share the **worst** (max) tuple.
 */
export function computeFamilyPlacementRollup(evaluations: FamilyRollupCandidateEval[]): FamilyPlacementRollup | null {
    if (!evaluations.length) return null;

    const strictGroups = new Map<string, FamilyRollupCandidateEval[]>();
    const standalone: FamilyRollupCandidateEval[] = [];

    for (const ev of evaluations) {
        if (ev.link_mode === "strictly_together" && ev.link_group_id) {
            const list = strictGroups.get(ev.link_group_id) ?? [];
            list.push(ev);
            strictGroups.set(ev.link_group_id, list);
        } else {
            standalone.push(ev);
        }
    }

    const units: Array<{ sortTuple: Array<string | number | null>; candidateId: string; bucket: string }> = [];
    let blockedByStrict = false;
    let strictCrossOppIncomplete = false;

    for (const ev of standalone) {
        units.push({ sortTuple: ev.sortTuple, candidateId: ev.candidateId, bucket: ev.bucket_key });
    }

    for (const [, members] of strictGroups) {
        const tuples = members.map((m) => m.sortTuple);
        const groupTuple = maxSortTuple(tuples);
        if (!groupTuple) continue;
        const rep =
            members.find((m) => comparePlacementSortTuples(m.sortTuple, groupTuple) === 0) ?? members[0]!;
        units.push({ sortTuple: groupTuple, candidateId: rep.candidateId, bucket: rep.bucket_key });
        if (members.length > 1) blockedByStrict = true;
        const crossOpp = members.some((m) => m.link_group_member_count > members.length);
        if (crossOpp) strictCrossOppIncomplete = true;
    }

    const best = minSortTuple(units);
    if (!best) return null;

    return {
        bucket: best.bucket,
        sort_tuple: best.sortTuple,
        blocked_by_strict_link: blockedByStrict,
        strict_link_cross_opportunity_incomplete: strictCrossOppIncomplete,
        candidate_count: evaluations.length,
        representative_candidate_id: best.candidateId,
    };
}
