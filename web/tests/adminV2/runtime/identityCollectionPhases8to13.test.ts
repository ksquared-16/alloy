import { describe, expect, it } from "vitest";

import {
    applyNestedSurfaceFieldDrop,
    defaultNestedSurfaceConfig,
    addFieldToNestedGroup,
    moveFieldInNestedGroup,
    CHILDREN_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { generateDefaultIdentityFieldPlacements } from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import { buildChildIdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import { reconcileIdentityNestedConfig } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import {
    collectUnsupportedEditableIdentityConfigs,
    identityFieldVisibilityOptionsForBuilder,
    resolveIdentityFieldEditContract,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldEditContract";
import { setFieldVisibilityForIdentityTier } from "@/lib/adminV2/settings/surfaces/identityFieldPolicy";
import {
    ENROLLMENT_MILESTONES_REFERENCE_COMPOSITION,
    projectMilestonesCardVM,
} from "@/lib/adminV2/runtime/focusPanel/milestones/milestonesCardBlueprint";
import {
    goBackCardLink,
    navigateCardLinkWithHistory,
    createEmptyFocusPanelCardLinkNavState,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLinkNavigation";
import { planFocusPanelCardGridFlow } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelCardGridFlow";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";

function sampleChild(overrides: Partial<ChildrenEvidenceChild> = {}): ChildrenEvidenceChild {
    return {
        id: "child-1",
        name: "Ada Lovelace",
        initial: "A",
        imageUrl: null,
        dobAge: "4y",
        gender: "Female",
        ageBand: "Preschool",
        program: "Preschool",
        room: "North",
        schedule: "M–F",
        teacher: null,
        startDate: "Aug 2026",
        status: "New Lead",
        statusTone: "work",
        needsAttention: false,
        detailLine: "Preschool · North · M–F",
        missingLine: null,
        flags: [],
        ...overrides,
    };
}

describe("identity field layout runtime parity (Phases 8–9)", () => {
    it("places Gender + Age Band on one row after beside drop and regenerates placements", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "child.gender", { tier: "summary" });
        config = addFieldToNestedGroup(config, "roster", "child.age_band", { tier: "summary" });
        config = applyNestedSurfaceFieldDrop(
            config,
            "roster",
            "child.age_band",
            "child.gender",
            "beside",
            { tier: "summary" },
        );

        const group = config.groups.find((g) => g.key === "roster")!;
        const placements = generateDefaultIdentityFieldPlacements(group).filter((p) => p.tier === "summary");
        const gender = placements.find((p) => p.fieldRef === "child.gender")!;
        const ageBand = placements.find((p) => p.fieldRef === "child.age_band")!;
        expect(gender.width).toBe("half");
        expect(ageBand.width).toBe("half");
        expect(gender.row).toBe(ageBand.row);
        expect(gender.column).toBe(1);
        expect(ageBand.column).toBe(2);

        const vm = buildChildIdentityRecordVM({
            config: reconcileIdentityNestedConfig(CHILDREN_SURFACE_ID, config),
            child: sampleChild(),
            groupKey: "roster",
        });
        const pair = vm.summaryRows.find(
            (row) =>
                row.cells.some((c) => c.fieldRef === "child.gender")
                && row.cells.some((c) => c.fieldRef === "child.age_band"),
        );
        expect(pair).toBeTruthy();
        expect(pair!.cells.map((c) => c.fieldRef)).toEqual(["child.gender", "child.age_band"]);
    });

    it("swaps Gender / Age Band order after move + publish-shaped reconcile", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "child.gender", { tier: "summary" });
        config = addFieldToNestedGroup(config, "roster", "child.age_band", { tier: "summary" });
        config = applyNestedSurfaceFieldDrop(
            config,
            "roster",
            "child.age_band",
            "child.gender",
            "beside",
            { tier: "summary" },
        );
        // Move age_band before gender while keeping half widths.
        config = moveFieldInNestedGroup(config, "roster", "child.age_band", -1, { tier: "summary" });

        const vm = buildChildIdentityRecordVM({
            config: reconcileIdentityNestedConfig(CHILDREN_SURFACE_ID, config),
            child: sampleChild(),
            groupKey: "roster",
        });
        const pair = vm.summaryRows.find(
            (row) =>
                row.cells.some((c) => c.fieldRef === "child.gender")
                && row.cells.some((c) => c.fieldRef === "child.age_band"),
        );
        expect(pair!.cells.map((c) => c.fieldRef)).toEqual(["child.age_band", "child.gender"]);
    });

    it("uses the same interpreter for summary and context depths", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "child.gender", { tier: "context_fact" });
        config = addFieldToNestedGroup(config, "roster", "child.age_band", { tier: "context_fact" });
        config = applyNestedSurfaceFieldDrop(
            config,
            "roster",
            "child.age_band",
            "child.gender",
            "beside",
            { tier: "context_fact" },
        );
        const vm = buildChildIdentityRecordVM({
            config: reconcileIdentityNestedConfig(CHILDREN_SURFACE_ID, config),
            child: sampleChild(),
            groupKey: "roster",
        });
        const pair = vm.contextFactRows.find(
            (row) =>
                row.cells.some((c) => c.fieldRef === "child.gender")
                && row.cells.some((c) => c.fieldRef === "child.age_band"),
        );
        expect(pair).toBeTruthy();
    });
});

describe("identity edit capability contract (Phase 10)", () => {
    it("offers Editable and Linked for Program; Linked-only for schedule", () => {
        expect(resolveIdentityFieldEditContract("child.age_band").canOfferEditable).toBe(false);
        expect(identityFieldVisibilityOptionsForBuilder("child.age_band")).not.toContain("editable");
        // Desired Program: Editable before assignment, Linked once Assignments owns it.
        expect(resolveIdentityFieldEditContract("inquiry_child.program").canOfferEditable).toBe(true);
        expect(identityFieldVisibilityOptionsForBuilder("inquiry_child.program")).toEqual([
            "editable",
            "linked",
            "read-only",
            "hidden",
        ]);
        expect(identityFieldVisibilityOptionsForBuilder("inquiry_child.schedule_type")).toEqual([
            "linked",
            "read-only",
            "hidden",
        ]);
        expect(identityFieldVisibilityOptionsForBuilder("inquiry_child.schedule_type")).not.toContain(
            "editable",
        );
    });

    it("rejects unsupported editable configs at publish validation", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "child.age_band", { tier: "summary" });
        config = setFieldVisibilityForIdentityTier(
            config,
            "roster",
            "child.age_band",
            "summary",
            "editable",
        );
        const issues = collectUnsupportedEditableIdentityConfigs(config);
        expect(issues.some((issue) => issue.fieldRef === "child.age_band")).toBe(true);
    });
});

describe("milestones blueprint (Phase 12)", () => {
    it("projects Enrollment reference composition without inventing facts", () => {
        const vm = projectMilestonesCardVM({
            facts: [
                {
                    id: "t1",
                    typeKey: "tour.booking",
                    label: "Tour booked",
                    at: "2026-08-01T15:00:00.000Z",
                    bucket: "upcoming",
                    scope: "household",
                    sourceOwner: "tour_bookings",
                    destinationCard: "tour_summary",
                },
            ],
            config: ENROLLMENT_MILESTONES_REFERENCE_COMPOSITION,
        });
        expect(vm.facts).toHaveLength(1);
        expect(vm.facts[0]!.destinationCard).toBe("tour_summary");
        expect(vm.answerLine).toContain("1 milestone");
    });
});

describe("card link navigation (Phase 13)", () => {
    it("walks Children → Scheduling → Children via back stack", () => {
        const focused: Array<{ card: string; focus: string | null }> = [];
        const coordination = {
            focusTargets: new Set(["children", "scheduling", "milestones"]),
            request: null,
            requestFocus: (card: string, focus: string | null) => {
                focused.push({ card, focus });
            },
        } as unknown as FocusPanelCoordination;

        let nav = createEmptyFocusPanelCardLinkNavState();
        const toSchedule = navigateCardLinkWithHistory({
            coordination,
            link: { id: "1", fromCard: "children", toCard: "scheduling" },
            sourceFocus: "child-1",
            nav,
        });
        expect(toSchedule.ok).toBe(true);
        nav = toSchedule.nav;

        const back = goBackCardLink({ coordination, nav });
        expect(back.ok).toBe(true);
        expect(back.nav.activeCard).toBe("children");
        expect(focused.map((f) => f.card)).toEqual(["scheduling", "children"]);
    });
});

describe("responsive card grid-flow (Phase 11)", () => {
    it("packs shared-row cards and stacks full-width / narrow layouts", () => {
        const placements = [
            {
                cardKey: "children" as const,
                order: 1,
                preferredColumnSpan: 6,
                fullWidth: false,
                breakpointBehavior: "shrink_span" as const,
            },
            {
                cardKey: "household" as const,
                order: 2,
                preferredColumnSpan: 6,
                fullWidth: false,
                breakpointBehavior: "shrink_span" as const,
            },
            {
                cardKey: "milestones" as const,
                order: 3,
                preferredColumnSpan: 12,
                fullWidth: true,
                breakpointBehavior: "stack" as const,
            },
        ];
        const wide = planFocusPanelCardGridFlow({ placements, columns: 12 });
        expect(wide.rows).toHaveLength(2);
        expect(wide.rows[0]!.cards.map((c) => c.cardKey)).toEqual(["children", "household"]);
        expect(wide.rows[1]!.cards.map((c) => c.cardKey)).toEqual(["milestones"]);

        const stacked = planFocusPanelCardGridFlow({ placements, forceStack: true });
        expect(stacked.stacked).toBe(true);
        expect(stacked.rows).toHaveLength(3);
    });
});
