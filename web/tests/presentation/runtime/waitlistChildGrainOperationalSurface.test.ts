/**
 * Child-grain Waitlist operational surface — placement attach, group/sort, catch-all label.
 */

import { describe, expect, it } from "vitest";
import {
    applyQueueRowVariantGroupAndSortCriteria,
} from "@/lib/presentation/runtime/applyQueueRowVariantGroupAndSortCriteria";
import { resolveQueueRowFieldValueFromContext } from "@/lib/presentation/runtime/resolveCompactSlotDisplay";
import { childQueueRowContext } from "@/lib/runtime/provisioning/childGrainSurfaceComposition";
import type { ChildProvisioningRowWithPlacement } from "@/lib/runtime/provisioning/attachChildGrainWaitlistPlacement";
import { waitlistContextFromPlacementProjection } from "@/lib/runtime/provisioning/attachChildGrainWaitlistPlacement";
import {
    normalizeCatchAllWorkViewCompatBinding,
    WORK_VIEW_CATCH_ALL_OPERATOR_LABEL,
} from "@/lib/lifecycle/workViewsConfigV1";
import { QUEUE_ROW_CONTEXT_CONTRACT_VERSION, type QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { PlacementWaitlistCandidateRowProjection } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";

function placementProj(
    overrides: Partial<PlacementWaitlistCandidateRowProjection> & {
        placement_candidate_id: string;
        opportunity_id: string;
        child_display_name: string;
        program_room_group_label: string;
        runtime_position: number;
    },
): PlacementWaitlistCandidateRowProjection {
    return {
        row_projection: "placement_candidate",
        family_display_name: "Kurzman Family",
        program_room_cohort_key: overrides.program_room_group_label.toLowerCase(),
        bucket: "standard",
        wait_since: "Aug 8",
        sibling_context: {
            has_siblings_on_waitlist: false,
            sibling_candidate_count: 0,
            sibling_cohorts: [],
            link_mode: "independent",
        },
        placement_priority_v2: {
            placement_candidate_id: overrides.placement_candidate_id,
            program_room_cohort_key: overrides.program_room_group_label.toLowerCase(),
            bucket: "standard",
            score: 100 - overrides.runtime_position,
            sort_tuple: [overrides.program_room_group_label.toLowerCase(), overrides.runtime_position],
            link_mode: "independent",
            active_override_kinds: [],
        },
        shadow_mode: false,
        runtime_position_label: `Position ${overrides.runtime_position}/2`,
        runtime_position_total: 2,
        runtime_position_mode: "live",
        ...overrides,
    };
}

describe("child Waitlist placement context parity", () => {
    it("emits waitlist_context + program placement_context from attached projection", () => {
        const row: ChildProvisioningRowWithPlacement = {
            subjectId: "cm-lennon",
            participationId: "pi-lennon",
            contextId: "opp-kurzman",
            legacyOcmId: null,
            stageKey: "waitlist",
            statusKey: "waitlisted",
            title: "Lennon Kurzman",
            updatedAt: null,
            placementWaitlistRow: placementProj({
                placement_candidate_id: "pc-1",
                opportunity_id: "opp-kurzman",
                child_display_name: "Lennon Kurzman",
                program_room_group_label: "Infant",
                runtime_position: 1,
            }),
            placementCandidateId: "pc-1",
        };
        const ctx = childQueueRowContext({
            row,
            stageLabel: "Waitlist",
            stageLabelsByKey: { waitlist: "Waitlist" },
            lifecycleKey: "enrollment",
            familyName: "Kurzman Family",
        });
        expect(ctx?.waitlist_context?.position_label).toBe("Position 1/2");
        expect(ctx?.waitlist_context?.wait_since).toBe("Aug 8");
        expect(ctx?.placement_context?.program_label).toBe("Infant");
        expect(resolveQueueRowFieldValueFromContext("waitlist.positionLabel", ctx!)).toBe("Position 1/2");
        expect(resolveQueueRowFieldValueFromContext("child.program", ctx!)).toBe("Infant");
        expect(resolveQueueRowFieldValueFromContext("waitlist.waitSince", ctx!)).toBe("Aug 8");
    });

    it("groups by Program then sorts by waitlist position within each group", () => {
        const mk = (
            id: string,
            program: string,
            position: number,
        ): Record<string, unknown> => ({
            id,
            _placement_waitlist_row: {
                runtime_position: position,
                program_room_group_label: program,
                runtime_position_section_key: program.toLowerCase(),
            },
            context: {
                contract_version: QUEUE_ROW_CONTEXT_CONTRACT_VERSION,
                placement_context: { location_id: null, program_label: program },
                waitlist_context: { position_label: `Position ${position}/2` },
            } as QueueRowContext,
        });
        const sorted = applyQueueRowVariantGroupAndSortCriteria(
            [
                mk("wrigley", "Toddler", 1),
                mk("lennon", "Infant", 2),
                mk("emma", "Infant", 1),
            ],
            [{ key: "program" }],
            [{ key: "waitlist.position", direction: "asc" }],
        );
        expect(sorted.map((r) => r.id)).toEqual(["emma", "lennon", "wrigley"]);
    });

    it("waitlistContextFromPlacementProjection ignores empty projections", () => {
        expect(waitlistContextFromPlacementProjection(null)).toBeUndefined();
        expect(
            waitlistContextFromPlacementProjection(
                placementProj({
                    placement_candidate_id: "pc",
                    opportunity_id: "opp",
                    child_display_name: "A",
                    program_room_group_label: "Infant",
                    runtime_position: 1,
                    runtime_position_label: null as unknown as string,
                    wait_since: null,
                    placement_priority_v2: {
                        placement_candidate_id: "pc",
                        program_room_cohort_key: "infant",
                        bucket: "standard",
                        sort_tuple: [],
                        link_mode: "independent",
                        active_override_kinds: [],
                    },
                }),
            ),
        ).toBeUndefined();
    });
});

describe("All Leads catch-all label semantics", () => {
    it("renames misleading All Leads catch-all label to All Enrollment without changing filters", () => {
        const repaired = normalizeCatchAllWorkViewCompatBinding({
            id: "new_work_view_6",
            label: "All Leads",
            display_order: 1,
            visible_in_runtime: true,
            filters_v1: [],
        });
        expect(repaired.label).toBe(WORK_VIEW_CATCH_ALL_OPERATOR_LABEL);
        expect(repaired.filters_v1).toEqual([]);
    });

    it("does not rename stage-filtered Leads views", () => {
        const repaired = normalizeCatchAllWorkViewCompatBinding({
            id: "new_leads",
            label: "New Leads",
            display_order: 1,
            visible_in_runtime: true,
            filters_v1: [{ field: "opportunity_stage", op: "equals", value: "lead" }],
        });
        expect(repaired.label).toBe("New Leads");
    });
});
