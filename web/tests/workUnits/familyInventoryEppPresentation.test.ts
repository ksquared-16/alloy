/**
 * Family inventory EPP presentation — Effective Process Position rollup for stage/location chips.
 * Does not rewrite opportunities.stage_key; presentation only.
 */

import { describe, expect, it } from "vitest";

import { composeStageRollup } from "@/lib/process/engine/effectiveProcessPosition";
import { buildPartialQueueRowContext } from "@/lib/workUnits/buildPartialQueueRowContext";
import { childQueueRowContext } from "@/lib/runtime/provisioning/childGrainSurfaceComposition";
import type { ChildProvisioningRowWithPlacement } from "@/lib/runtime/provisioning/attachChildGrainWaitlistPlacement";
import { waitlistContextFromPlacementProjection } from "@/lib/runtime/provisioning/attachChildGrainWaitlistPlacement";

const queue = { key: "all_family_leads", label: "All Family Leads", lifecycle_key: "enrollment" };

describe("Family inventory EPP stage presentation", () => {
    it("raw context Lead + both children Waitlist → family row shows Waitlist (not Lead)", () => {
        const rollup = composeStageRollup(["waitlist", "waitlist"]);
        expect(rollup.compactLabel).toBe("waitlist");

        const ctx = buildPartialQueueRowContext({
            row: {
                id: "opp-kurzman",
                name: "Kurzman Family",
                stage_key: "lead",
                _effective_stage_rollup_label: rollup.compactLabel,
                _effective_location_rollup_label: null,
                location_id: "loc-north",
                _location_label: "North Campus",
            },
            queue,
        });
        expect(ctx.row_stage).toBe("Waitlist");
        expect(ctx.row_stage.toLowerCase()).not.toContain("lead");
        expect(ctx.placement_context?.location_label).toBe("North Campus");
    });

    it("mixed Lead + Waitlist → compact mixed rollup", () => {
        const rollup = composeStageRollup(["lead", "waitlist"]);
        expect(rollup.compactLabel).toBe("lead · waitlist");

        const ctx = buildPartialQueueRowContext({
            row: {
                id: "opp-mixed",
                name: "Mixed Family",
                stage_key: "lead",
                _effective_stage_rollup_label: rollup.compactLabel,
            },
            queue,
        });
        expect(ctx.row_stage).toBe("Lead · Waitlist");
    });

    it("shared Tour with no child divergence → Tour (family stage still matters)", () => {
        const rollup = composeStageRollup(["tour", "tour"]);
        expect(rollup.compactLabel).toBe("tour");
        const ctx = buildPartialQueueRowContext({
            row: {
                id: "opp-tour",
                name: "Tour Family",
                stage_key: "tour",
                _effective_stage_rollup_label: rollup.compactLabel,
            },
            queue,
        });
        expect(ctx.row_stage).toBe("Tour");
    });

    it("mixed locations → multi-location rollup label", () => {
        const ctx = buildPartialQueueRowContext({
            row: {
                id: "opp-locs",
                name: "Split Family",
                stage_key: "waitlist",
                _effective_stage_rollup_label: "waitlist",
                _effective_location_rollup_label: "2 locations",
            },
            queue,
        });
        expect(ctx.placement_context?.location_label).toBe("2 locations");
    });
});

describe("Waitlist placement rank + adjust projection", () => {
    it("waitlistContextFromPlacementProjection carries position + candidate for Adjust", () => {
        const ctx = waitlistContextFromPlacementProjection({
            row_projection: "placement_candidate",
            placement_candidate_id: "pc-lennon",
            opportunity_id: "opp-1",
            child_display_name: "Lennon",
            family_display_name: "Kurzman",
            program_room_cohort_key: "toddler",
            program_room_group_label: "Toddler",
            bucket: "tier_general_waitlist",
            sibling_context: {
                has_siblings_on_waitlist: false,
                sibling_candidate_count: 0,
                sibling_cohorts: [],
                link_mode: "independent",
            },
            placement_priority_v2: {
                placement_candidate_id: "pc-lennon",
                program_room_cohort_key: "toddler",
                bucket: "tier_general_waitlist",
                score: 42,
                sort_tuple: [],
                link_mode: "independent",
                active_override_kinds: [],
            },
            shadow_mode: false,
            runtime_position_label: "#1/1",
            wait_since: "Aug 1, 2026",
        });

        expect(ctx?.position_label).toBe("#1/1");
        expect(ctx?.placement_candidate_id).toBe("pc-lennon");
        expect(ctx?.can_adjust_placement).toBe(true);
        expect(ctx?.priority).toBe(42);
    });

    it("childQueueRowContext surfaces can_adjust_placement when candidate attached", () => {
        const row: ChildProvisioningRowWithPlacement = {
            subjectId: "cm-lennon",
            participationId: "pi-1",
            contextId: "opp-1",
            title: "Lennon Kurzman",
            stageKey: "waitlist",
            statusKey: null,
            legacyOcmId: null,
            familyCustomerId: null,
            updatedAt: null,
            placementCandidateId: "pc-lennon",
            placementWaitlistRow: {
                row_projection: "placement_candidate",
                placement_candidate_id: "pc-lennon",
                opportunity_id: "opp-1",
                child_display_name: "Lennon",
                family_display_name: "Kurzman",
                program_room_cohort_key: "toddler",
                program_room_group_label: "Toddler",
                bucket: "tier_general_waitlist",
                sibling_context: {
                    has_siblings_on_waitlist: false,
                    sibling_candidate_count: 0,
                    sibling_cohorts: [],
                    link_mode: "independent",
                },
                placement_priority_v2: {
                    placement_candidate_id: "pc-lennon",
                    program_room_cohort_key: "toddler",
                    bucket: "tier_general_waitlist",
                    score: 10,
                    sort_tuple: [],
                    link_mode: "independent",
                    active_override_kinds: [],
                },
                shadow_mode: false,
                runtime_position_label: "#1/1",
                wait_since: "Aug 1, 2026",
            },
        };

        const ctx = childQueueRowContext({
            row,
            stageLabel: "Waitlist",
            stageLabelsByKey: { waitlist: "Waitlist" },
            lifecycleKey: "enrollment",
            familyName: "Kurzman Family",
        });

        expect(ctx?.waitlist_context?.position_label).toBe("#1/1");
        expect(ctx?.waitlist_context?.placement_candidate_id).toBe("pc-lennon");
        expect(ctx?.waitlist_context?.can_adjust_placement).toBe(true);
        expect(ctx?.placement_context?.program_label).toMatch(/Toddler/i);
    });
});
