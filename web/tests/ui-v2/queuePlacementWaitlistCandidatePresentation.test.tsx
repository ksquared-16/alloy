import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
    QueueRowPlacementCandidateContext,
    QueueRowPlacementCandidateMetaChips,
    QueueRowPlacementCandidatePanel,
} from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementCandidatePanel";
import { QueueRowPlacementManualOrderControls } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementManualOrderControls";
import type { QueueRowPlacementWaitlistCandidateVm } from "@/lib/ui-v2/workspace-types";
import {
    buildPlacementWaitlistWorkUnitGroupHeaders,
    parsePlacementWaitlistCandidateRowVm,
} from "@/lib/ui-v2/queuePlacementWaitlistCandidatePresentation";
import { buildPlacementV2QueueHint } from "@/lib/ui-v2/queuePlacementPriorityV2Presentation";
import { buildWorkUnitQueueCrmCompactRowSliceForPlacementCandidate } from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";
import { expandOpportunityRowsToPlacementCandidateRows } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { type QueueUiRowPreviewField } from "@/lib/ui-v2/queueUiConfig";

const sampleRow: QueueRowPlacementWaitlistCandidateVm = {
    placementCandidateId: "pc-1",
    opportunityId: "opp-1",
    childDisplayName: "Liam Hayes",
    familyDisplayName: "Hayes household",
    parentDisplayName: "Jordan Hayes",
    cohortKey: "preschool_3_4",
    cohortLabel: "Preschool — 3–4 years",
    cohortSectionTitle: "Preschool — 3–4 years Waitlist",
    bucketLabel: "Standard family",
    waitSinceLabel: "Jan 1, 2024",
    linkModeLabel: null,
    isSyntheticFallback: false,
    hasActiveOverride: false,
    activeOverrideKinds: [],
    activeOverrides: [],
    hasManualPositionAdjustment: false,
    manualAdjustmentReason: null,
    pinOverrideId: null,
    shadowMode: true,
    forecastHints: [],
    siblingLabel: "1 sibling also waitlisted",
    siblingCohorts: [
        {
            placementCandidateId: "pc-2",
            childDisplayName: "Sophia Hayes",
            cohortLabel: "Young Toddler — 18–24 months",
            linkModeLabel: null,
        },
    ],
    siblingContextLines: ["Sibling also waitlisted: Sophia Hayes — Young Toddler — 18–24 months"],
    siblingContextDiagnostics: null,
};

function wantAll(_f: QueueUiRowPreviewField) {
    return true;
}

describe("queuePlacementWaitlistCandidatePresentation", () => {
    it("parses candidate row projection with single cohort", () => {
        const vm = parsePlacementWaitlistCandidateRowVm({
            row_projection: "placement_candidate",
            placement_candidate_id: "pc-1",
            opportunity_id: "opp-1",
            child_display_name: "Liam Hayes",
            family_display_name: "Hayes household",
            parent_display_name: "Jordan Hayes",
            program_room_cohort_key: "preschool_3_4",
            program_room_group_label: "Preschool — 3–4 years",
            bucket: "tier_general_waitlist",
            wait_since: "2024-01-01T00:00:00.000Z",
            sibling_context: {
                has_siblings_on_waitlist: true,
                sibling_candidate_count: 1,
                sibling_cohorts: [
                    {
                        placement_candidate_id: "pc-2",
                        child_display_name: "Sophia Hayes",
                        program_room_group_label: "Young Toddler",
                        program_room_cohort_key: "young_toddler",
                    },
                ],
                link_mode: "independent",
            },
            placement_priority_v2: {
                placement_candidate_id: "pc-1",
                program_room_cohort_key: "preschool_3_4",
                bucket: "tier_general_waitlist",
                sort_tuple: [],
                link_mode: "independent",
                active_override_kinds: [],
            },
            shadow_mode: true,
        });
        expect(vm?.cohortLabel).toBe("Preschool — 3–4 years");
        expect(vm?.siblingContextLines[0]).toContain("Sophia Hayes");
        expect(vm?.siblingContextLines[0]).toContain("Young Toddler");
        expect(vm?.activeOverrides).toEqual([]);
        expect(vm?.hasManualPositionAdjustment).toBe(false);
        expect(vm?.cohortSectionTitle).not.toMatch(/Young Toddler/);
    });

    it("resolves row section title from location categories when OCM site context exists", () => {
        const vm = parsePlacementWaitlistCandidateRowVm(
            {
                row_projection: "placement_candidate",
                placement_candidate_id: "pc-1",
                opportunity_id: "opp-1",
                child_display_name: "Liam Hayes",
                family_display_name: "Hayes household",
                program_room_cohort_key: "infant",
                program_room_group_label: "Infant",
                site_id: "site-a",
                program_key: "infant",
                program_category_id: "cat-infant",
                bucket: "tier_general_waitlist",
                placement_priority_v2: {
                    placement_candidate_id: "pc-1",
                    program_room_cohort_key: "infant",
                    bucket: "tier_general_waitlist",
                    sort_tuple: [],
                    link_mode: "independent",
                    active_override_kinds: [],
                },
            },
            {
                categories: [
                    {
                        id: "cat-infant",
                        org_id: "org-1",
                        location_id: "site-a",
                        key: "infant",
                        label: "Babies",
                        sort_order: 10,
                        is_active: true,
                    },
                ],
            }
        );
        expect(vm?.cohortSectionTitle).toBe("Babies waitlist");
        expect(vm?.siteId).toBe("site-a");
        expect(vm?.programKey).toBe("infant");
    });

    it("parses manual position adjustment from pin override", () => {
        const vm = parsePlacementWaitlistCandidateRowVm({
            row_projection: "placement_candidate",
            placement_candidate_id: "pc-1",
            opportunity_id: "opp-1",
            child_display_name: "Mia Hayes",
            family_display_name: "Hayes household",
            program_room_cohort_key: "pre_k",
            program_room_group_label: "Pre-K — 4–5 years",
            bucket: "tier_general_waitlist",
            placement_priority_v2: {
                placement_candidate_id: "pc-1",
                program_room_cohort_key: "pre_k",
                bucket: "tier_general_waitlist",
                sort_tuple: [],
                link_mode: "independent",
                active_override_kinds: ["pin"],
                active_overrides: [
                    { id: "ov-pin", override_kind: "pin", reason: "Director requested bump" },
                ],
            },
        });
        expect(vm?.hasManualPositionAdjustment).toBe(true);
        expect(vm?.manualAdjustmentReason).toBe("Director requested bump");
        expect(vm?.pinOverrideId).toBe("ov-pin");
    });
});

describe("buildPlacementWaitlistWorkUnitGroupHeaders", () => {
    it("maps cohort keys to org-level section labels (not room slugs)", () => {
        const headers = buildPlacementWaitlistWorkUnitGroupHeaders([
            {
                groupKey: "preschool_3_4_years",
                groupLabel: "Preschool — 3–4 years Waitlist",
            },
            {
                groupKey: "young_toddler_18_24_months",
                groupLabel: "Young Toddler — 18–24 months Waitlist",
            },
        ]);
        expect(headers.preschool?.label).toBe("Preschool waitlist");
        expect(headers.toddler?.label).toBe("Toddler waitlist");
    });
});

describe("Hayes multi-child waitlist presentation", () => {
    it("produces three distinct human-labeled sections without combined cohort keys", () => {
        const { rows } = expandOpportunityRowsToPlacementCandidateRows([
            {
                id: "opp-hayes",
                _placement_priority_v2: {
                    projection_mode: "family_row",
                    evaluated: true,
                    shadow_mode: true,
                    candidates: [
                        {
                            placement_candidate_id: "pc-liam",
                            child_display_name: "Liam Hayes",
                            program_room_cohort_key: "preschool_3_4_years",
                            program_room_group_label: "Preschool — 3–4 years",
                            bucket: "tier_general_waitlist",
                            sort_tuple: ["preschool_3_4_years", 1],
                            link_mode: "independent",
                            active_override_kinds: [],
                        },
                        {
                            placement_candidate_id: "pc-mia",
                            child_display_name: "Mia Hayes",
                            program_room_cohort_key: "pre_k_4_5_years",
                            program_room_group_label: "Pre-K — 4–5 years",
                            bucket: "tier_general_waitlist",
                            sort_tuple: ["pre_k_4_5_years", 2],
                            link_mode: "independent",
                            active_override_kinds: [],
                        },
                        {
                            placement_candidate_id: "pc-sophia",
                            child_display_name: "Sophia Hayes",
                            program_room_cohort_key: "young_toddler_18_24_months",
                            program_room_group_label: "Young Toddler — 18–24 months",
                            bucket: "tier_general_waitlist",
                            sort_tuple: ["young_toddler_18_24_months", 3],
                            link_mode: "independent",
                            active_override_kinds: [],
                        },
                    ],
                    family_rollup: { bucket: "tier_general_waitlist", sort_tuple: [], candidate_count: 3 },
                },
            },
        ]);
        const sorted = sortPlacementCandidateQueueRows(rows, true);
        const vms = sorted
            .map((r) => parsePlacementWaitlistCandidateRowVm(r._placement_waitlist_row))
            .filter(Boolean);
        expect(vms).toHaveLength(3);

        const sectionTitles = vms.map((v) => v!.cohortSectionTitle);
        expect(sectionTitles).toEqual([
            "Toddler waitlist",
            "Preschool waitlist",
            "Pre-K waitlist",
        ]);
        expect(sectionTitles.every((t) => !t.includes("_"))).toBe(true);

        const mia = vms.find((v) => v!.childDisplayName === "Mia Hayes")!;
        expect(mia.cohortLabel).toBe("Pre-K — 4–5 years");
        expect(mia.cohortLabel).not.toContain("Preschool");

        const liam = vms.find((v) => v!.childDisplayName === "Liam Hayes")!;
        expect(liam.cohortLabel).toBe("Preschool — 3–4 years");
        expect(liam.siblingCohorts).toHaveLength(2);
        expect(liam.siblingCohorts.map((s) => s.cohortLabel).join(" ")).not.toContain("Preschool");
    });
});

describe("buildWorkUnitQueueCrmCompactRowSliceForPlacementCandidate", () => {
    it("maps child and program into standard children_programs fact group", () => {
        const slice = buildWorkUnitQueueCrmCompactRowSliceForPlacementCandidate(
            { _customer_name: "Hayes household" },
            wantAll,
            null,
            sampleRow
        );
        const childProgram = slice.crmFactGroups.find((g) => g.kind === "children_programs");
        expect(childProgram?.columnGrid?.rows).toEqual([["Liam Hayes", "Preschool — 3–4 years"]]);
        expect(slice.childDisplayLine).toBe("Liam Hayes");
        expect(slice.programDeduped).toBe("Preschool — 3–4 years");
    });
});

describe("QueueRowPlacementCandidateMetaChips", () => {
    it("renders compact bucket/wait/site chips without program column duplication", () => {
        const html = renderToStaticMarkup(
            <QueueRowPlacementCandidateMetaChips row={sampleRow} siteLabel="Hayes Campus" />
        );
        expect(html).toContain("Standard family");
        expect(html).toContain("Waitlisted since Jan 1, 2024");
        expect(html).toContain("Hayes Campus");
        expect(html).not.toContain("Program");
        expect(html).not.toContain("Preschool — 3–4 years");
        expect(html).not.toContain("Preview only");
    });

    it("shows manually adjusted chip for pin override", () => {
        const html = renderToStaticMarkup(
            <QueueRowPlacementCandidateMetaChips
                row={{
                    ...sampleRow,
                    hasManualPositionAdjustment: true,
                    manualAdjustmentReason: "Sibling starting soon",
                    hasActiveOverride: true,
                    activeOverrideKinds: ["pin"],
                    activeOverrides: [{ id: "ov-1", overrideKind: "pin", reason: "Sibling starting soon" }],
                }}
            />
        );
        expect(html).toContain("Manually adjusted");
        expect(html).not.toContain("pin");
        expect(html).not.toContain("Override");
    });

    it("shows forecast hint chip when forecast metadata present", () => {
        const html = renderToStaticMarkup(
            <QueueRowPlacementCandidateMetaChips
                row={{ ...sampleRow, forecastHints: ["Expected opening soon"] }}
            />
        );
        expect(html).toContain("Expected opening soon");
        expect(html).toContain("adminv2-ws-queue-placement-candidate__forecast-chip");
    });

    it("does not duplicate runtime position in meta chips", () => {
        const html = renderToStaticMarkup(
            <QueueRowPlacementCandidateMetaChips
                row={{
                    ...sampleRow,
                    runtimePositionLabel: "Preview position 3/10",
                }}
            />
        );
        expect(html).not.toContain("Preview position 3/10");
    });
});

describe("QueueRowPlacementManualOrderControls", () => {
    it("stacks preview position above adjust in left identity", () => {
        const html = renderToStaticMarkup(
            <QueueRowPlacementManualOrderControls
                row={{
                    ...sampleRow,
                    runtimePosition: 1,
                    runtimePositionTotal: 3,
                    runtimePositionLabel: "Preview position 1/3",
                }}
            />
        );
        const positionIdx = html.indexOf("Preview position 1/3");
        const adjustIdx = html.indexOf("Adjust position");
        expect(positionIdx).toBeGreaterThan(-1);
        expect(adjustIdx).toBeGreaterThan(positionIdx);
        expect(html).toContain('data-queue-placement="waitlist-left-meta"');
    });

    it("shows runtime position label in inline left meta", () => {
        const html = renderToStaticMarkup(
            <QueueRowPlacementManualOrderControls
                row={{
                    ...sampleRow,
                    runtimePosition: 3,
                    runtimePositionTotal: 10,
                    runtimePositionLabel: "Preview position 3/10",
                    runtimePositionHelp:
                        "Position is calculated from the current priority rules and filters. It is not a permanent stored rank. Ranked below manually adjusted row(s) in this program section.",
                }}
            />
        );
        expect(html).toContain("Preview position 3/10");
        expect(html).toContain("Adjust position");
        expect(html).toContain('data-queue-placement="waitlist-left-meta"');
        expect(html).toContain("manually adjusted");
    });

    it("renders adjust position action", () => {
        const html = renderToStaticMarkup(
            <QueueRowPlacementManualOrderControls
                row={{ ...sampleRow, runtimePosition: 2, runtimePositionTotal: 3 }}
            />
        );
        expect(html).toContain("Adjust position");
        expect(html).not.toContain("Move up");
    });

    it("shows clear adjustment when manual adjustment active", () => {
        const html = renderToStaticMarkup(
            <QueueRowPlacementManualOrderControls
                row={{
                    ...sampleRow,
                    hasManualPositionAdjustment: true,
                    manualAdjustmentReason: "Ops review",
                    runtimePosition: 1,
                    runtimePositionTotal: 3,
                }}
            />
        );
        expect(html).toContain("Clear adjustment");
        expect(html).toContain('title="Clear adjustment"');
    });
});

describe("QueueRowPlacementCandidateContext", () => {
    it("shows sibling details inline without expand toggle", () => {
        const html = renderToStaticMarkup(<QueueRowPlacementCandidateContext row={sampleRow} />);
        expect(html).toContain("Sibling also waitlisted: Sophia Hayes");
        expect(html).not.toContain("1 sibling also waitlisted");
        expect(html).not.toContain("sibling-toggle");
        expect(html).not.toContain("▸");
    });

    it("shows enrolled sibling line when present", () => {
        const html = renderToStaticMarkup(
            <QueueRowPlacementCandidateContext
                row={{
                    ...sampleRow,
                    siblingContextLines: ["Sibling enrolled: Jordan Patel — Preschool"],
                }}
            />
        );
        expect(html).toContain("Sibling enrolled: Jordan Patel — Preschool");
    });
});

describe("QueueBlock left identity (candidate grain)", () => {
    it("does not render parent name under family title for candidate rows", () => {
        const html = renderToStaticMarkup(
            <QueueRowPlacementCandidateContext row={sampleRow} />
        );
        expect(html).not.toContain("Jordan Hayes");
    });
});

describe("buildPlacementV2QueueHint", () => {
    it("uses lane-level shadow copy for candidate rows", () => {
        const hint = buildPlacementV2QueueHint({ shadowMode: true, candidateRowLayout: true });
        expect(hint).toBe("Priority preview");
    });

    it("uses live ordering cue when shadow is off", () => {
        const hint = buildPlacementV2QueueHint({ shadowMode: false, candidateRowLayout: true });
        expect(hint).toBe("Ordered by priority");
    });
});

describe("QueueRowPlacementCandidatePanel", () => {
    it("shows bucket chip and sibling context without combined cohort labels", () => {
        const html = renderToStaticMarkup(<QueueRowPlacementCandidatePanel row={sampleRow} statusLabel="Waitlisted" />);
        expect(html).toContain("Standard family");
        expect(html).not.toContain("Preschool — 3–4 years");
        expect(html).not.toContain("#1");
        expect(html).toContain("Sibling also waitlisted: Sophia Hayes");
        expect(html).toContain("Young Toddler — 18–24 months");
    });
});
