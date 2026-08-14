import { describe, expect, it } from "vitest";
import { comparePlacementSortTuples } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";
import {
    assignWaitlistCandidateRuntimePositions,
    formatWaitlistRuntimePositionLabel,
    readWaitlistCandidateSectionKey,
    stripPrimaryGroupFromPlacementSortTuple,
    waitlistVisibleOrderMatchesPriority,
    WAITLIST_RUNTIME_POSITION_HELP,
} from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";

function candidateRow(params: {
    id: string;
    cohortKey: string;
    cohortLabel: string;
    sortTuple: Array<string | number | null>;
    shadow?: boolean;
    pinOverride?: { id: string; reason: string };
}): Record<string, unknown> {
    const activeOverrides = params.pinOverride ?
        [{ id: params.pinOverride.id, override_kind: "pin", reason: params.pinOverride.reason }]
    :   [];
    return {
        id: params.id,
        __placement_v2_sort_tuple: params.sortTuple,
        _placement_waitlist_row: {
            row_projection: "placement_candidate",
            placement_candidate_id: params.id,
            opportunity_id: "opp-1",
            child_display_name: "Child",
            family_display_name: "Family",
            program_room_cohort_key: params.cohortKey,
            program_room_group_label: params.cohortLabel,
            bucket: "tier_general_waitlist",
            sibling_context: {
                has_siblings_on_waitlist: false,
                sibling_candidate_count: 0,
                sibling_cohorts: [],
                link_mode: "independent",
            },
            placement_priority_v2: {
                placement_candidate_id: params.id,
                program_room_cohort_key: params.cohortKey,
                bucket: "tier_general_waitlist",
                sort_tuple: params.sortTuple,
                link_mode: "independent",
                active_override_kinds: params.pinOverride ? ["pin"] : [],
                active_overrides: activeOverrides,
            },
            shadow_mode: params.shadow ?? false,
        },
    };
}

describe("waitlistCandidateRuntimePosition", () => {
    it("assigns category-scoped preview positions in shadow mode without reordering list", () => {
        const rows = [
            candidateRow({
                id: "pc-low",
                cohortKey: "toddler_room",
                cohortLabel: "Toddler Room",
                sortTuple: ["toddler_room", 100, "2024-06-03", "2024-09-01", "pc-low"],
            }),
            candidateRow({
                id: "pc-high",
                cohortKey: "toddler_room",
                cohortLabel: "Toddler Room",
                sortTuple: ["toddler_room", 10, "2024-06-01", "2024-09-01", "pc-high"],
            }),
        ];

        assignWaitlistCandidateRuntimePositions(rows, true);

        expect(rows[0]!.id).toBe("pc-low");
        const low = rows[0]!._placement_waitlist_row as {
            runtime_position?: number;
            runtime_position_total?: number;
            runtime_position_label?: string;
            runtime_position_mode?: string;
        };
        const high = rows[1]!._placement_waitlist_row as {
            runtime_position?: number;
            runtime_position_total?: number;
            runtime_position_label?: string;
        };
        expect(low.runtime_position).toBe(2);
        expect(high.runtime_position).toBe(1);
        expect(low.runtime_position_total).toBe(2);
        expect(low.runtime_position_label).toBe("Preview 2/2");
        expect(low.runtime_position_mode).toBe("preview");
        expect(readWaitlistCandidateSectionKey(rows[0]!)).toBe("toddler");
    });

    it("uses live labels after priority sort within section", () => {
        const rows = [
            candidateRow({
                id: "pc-b",
                cohortKey: "infant_room",
                cohortLabel: "Infant Room",
                sortTuple: ["infant_room", 100, "2024-06-02", "2024-09-01", "pc-b"],
            }),
            candidateRow({
                id: "pc-a",
                cohortKey: "infant_room",
                cohortLabel: "Infant Room",
                sortTuple: ["infant_room", 10, "2024-06-01", "2024-09-01", "pc-a"],
            }),
        ];
        const sorted = sortPlacementCandidateQueueRows(rows, false);
        assignWaitlistCandidateRuntimePositions(sorted, false);
        const first = sorted[0]!._placement_waitlist_row as {
            runtime_position?: number;
            runtime_position_label?: string;
            runtime_position_mode?: string;
        };
        expect(first.runtime_position).toBe(1);
        expect(first.runtime_position_label).toBe("1/2");
        expect(first.runtime_position_mode).toBe("live");
    });

    it("scopes totals separately per org category section", () => {
        const rows = [
            candidateRow({
                id: "pc-t1",
                cohortKey: "toddler_room",
                cohortLabel: "Toddler Room",
                sortTuple: ["toddler_room", 10, "2024-06-01", "2024-09-01", "pc-t1"],
            }),
            candidateRow({
                id: "pc-i1",
                cohortKey: "infant_room",
                cohortLabel: "Infant Room",
                sortTuple: ["infant_room", 10, "2024-06-01", "2024-09-01", "pc-i1"],
            }),
            candidateRow({
                id: "pc-t2",
                cohortKey: "toddler_room_b",
                cohortLabel: "Toddler Room B",
                sortTuple: ["toddler_room_b", 20, "2024-06-02", "2024-09-01", "pc-t2"],
            }),
        ];
        assignWaitlistCandidateRuntimePositions(rows, true);
        const toddler = rows[0]!._placement_waitlist_row as { runtime_position_total?: number };
        const infant = rows[1]!._placement_waitlist_row as { runtime_position_total?: number };
        expect(toddler.runtime_position_total).toBe(2);
        expect(infant.runtime_position_total).toBe(1);
    });

    it("does not introduce persisted rank fields on rows", () => {
        const rows = [
            candidateRow({
                id: "pc-1",
                cohortKey: "toddler_room",
                cohortLabel: "Toddler Room",
                sortTuple: ["toddler_room", 10, "2024-06-01", "2024-09-01", "pc-1"],
            }),
        ];
        assignWaitlistCandidateRuntimePositions(rows, false);
        expect(rows[0]).not.toHaveProperty("rank");
        expect(rows[0]).not.toHaveProperty("ordinal");
        expect(JSON.stringify(rows[0])).not.toMatch(/persisted_rank|stored_rank/i);
    });

    it("reports visible order mismatch in shadow and match in live", () => {
        const rows = [
            candidateRow({
                id: "pc-low",
                cohortKey: "toddler_room",
                cohortLabel: "Toddler Room",
                sortTuple: ["toddler_room", 100, "2024-06-03", "2024-09-01", "pc-low"],
            }),
            candidateRow({
                id: "pc-high",
                cohortKey: "toddler_room",
                cohortLabel: "Toddler Room",
                sortTuple: ["toddler_room", 10, "2024-06-01", "2024-09-01", "pc-high"],
            }),
        ];
        expect(waitlistVisibleOrderMatchesPriority(rows, true)).toBe(false);
        const sorted = sortPlacementCandidateQueueRows(rows, false);
        expect(waitlistVisibleOrderMatchesPriority(sorted, false)).toBe(true);
        expect(comparePlacementSortTuples).toBeDefined();
    });

    it("formats help copy for tooltip", () => {
        expect(formatWaitlistRuntimePositionLabel("preview", 3, 10)).toBe("Preview 3/10");
        expect(formatWaitlistRuntimePositionLabel("live", 3, 10)).toBe("3/10");
        expect(WAITLIST_RUNTIME_POSITION_HELP).toContain("not a permanent stored rank");
    });

    it("ranks employee preview #1 within section when cohort keys differ", () => {
        const rows = [
            candidateRow({
                id: "pc-general",
                cohortKey: "aaa_room",
                cohortLabel: "Toddler Room A",
                sortTuple: ["aaa_room", 50, "2024-06-01", "2024-09-01", "pc-general"],
            }),
            candidateRow({
                id: "pc-employee",
                cohortKey: "zzz_room",
                cohortLabel: "Toddler Room Z",
                sortTuple: ["zzz_room", 10, "2024-06-02", "2024-09-01", "pc-employee"],
            }),
        ];
        assignWaitlistCandidateRuntimePositions(rows, true);
        const general = rows[0]!._placement_waitlist_row as { runtime_position?: number };
        const employee = rows[1]!._placement_waitlist_row as { runtime_position?: number };
        expect(employee.runtime_position).toBe(1);
        expect(general.runtime_position).toBe(2);
        expect(stripPrimaryGroupFromPlacementSortTuple(["aaa_room", 50, 1])).toEqual([50, 1]);
    });

    it("manual pin beats employee and adds precedence note on preview row", () => {
        const rows = [
            candidateRow({
                id: "pc-employee",
                cohortKey: "toddler",
                cohortLabel: "Toddler",
                sortTuple: ["toddler", 10, "2024-06-01", "2024-09-01", "pc-employee"],
            }),
            candidateRow({
                id: "pc-pinned",
                cohortKey: "toddler",
                cohortLabel: "Toddler",
                sortTuple: ["toddler", 1, 50, "2024-06-02", "2024-09-01", "pc-pinned"],
                pinOverride: { id: "ov-1", reason: "Director pin" },
            }),
        ];
        assignWaitlistCandidateRuntimePositions(rows, true);
        const employee = rows[0]!._placement_waitlist_row as {
            runtime_position?: number;
            runtime_position_precedence_note?: string;
        };
        const pinned = rows[1]!._placement_waitlist_row as { runtime_position?: number };
        expect(pinned.runtime_position).toBe(1);
        expect(employee.runtime_position).toBe(2);
        expect(employee.runtime_position_precedence_note).toContain("manually adjusted");
    });

    it("employee with best bucket is preview 1/N when no override beats it", () => {
        const rows = [
            candidateRow({
                id: "pc-sibling",
                cohortKey: "infant",
                cohortLabel: "Infant",
                sortTuple: ["infant", 20, "2024-06-01", "2024-09-01", "pc-sibling"],
            }),
            candidateRow({
                id: "pc-employee",
                cohortKey: "infant",
                cohortLabel: "Infant",
                sortTuple: ["infant", 10, "2024-06-02", "2024-09-01", "pc-employee"],
            }),
            candidateRow({
                id: "pc-general",
                cohortKey: "infant",
                cohortLabel: "Infant",
                sortTuple: ["infant", 50, "2024-06-03", "2024-09-01", "pc-general"],
            }),
        ];
        assignWaitlistCandidateRuntimePositions(rows, true);
        const employee = rows[1]!._placement_waitlist_row as {
            runtime_position?: number;
            runtime_position_total?: number;
            runtime_position_label?: string;
        };
        expect(employee.runtime_position).toBe(1);
        expect(employee.runtime_position_total).toBe(3);
        expect(employee.runtime_position_label).toBe("Preview 1/3");
    });
});

describe("location filter denominator", () => {
    it("uses only rows present in filtered set as section total", () => {
        const siteA = candidateRow({
            id: "pc-a",
            cohortKey: "toddler_room",
            cohortLabel: "Toddler Room",
            sortTuple: ["toddler_room", 10, "2024-06-01", "2024-09-01", "pc-a"],
        });
        const siteB = candidateRow({
            id: "pc-b",
            cohortKey: "toddler_room",
            cohortLabel: "Toddler Room",
            sortTuple: ["toddler_room", 20, "2024-06-02", "2024-09-01", "pc-b"],
        });
        (siteA._placement_waitlist_row as Record<string, unknown>).site_id = "site-a";
        (siteB._placement_waitlist_row as Record<string, unknown>).site_id = "site-b";

        const filtered = [siteA];
        assignWaitlistCandidateRuntimePositions(filtered, true);
        const proj = siteA._placement_waitlist_row as { runtime_position_total?: number };
        expect(proj.runtime_position_total).toBe(1);
    });
});
