/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import {
    QUEUE_ROW_SIBLING_FIELD_KEYS,
    QUEUE_ROW_SIBLING_FIELD_METADATA,
    QUEUE_ROW_SIBLING_VISIBILITY_PRESETS,
} from "@/lib/layout/runtime/queueRowSiblingFieldRegistry";
import { resolveQueueRowSiblingFields } from "@/lib/layout/runtime/resolveQueueRowSiblingFields";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import { WAITLIST_PLACEMENT_FIELD_KEYS } from "@/lib/layout/runtime/queueWaitlistPlacementField";
import { validatorAllowedQueueRecordFieldRefKeys } from "@/lib/layout/queueRecordValidatorAllowList";
import { availableFieldsForZone } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import {
    buildQueueRowLibraryCatalog,
    QUEUE_ROW_UNAVAILABLE_SIBLING_LIBRARY,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";
import type { QueuePreviewItemVm, QueueRowPlacementWaitlistCandidateVm } from "@/lib/ui-v2/workspace-types";

function waitlistVm(
    overrides: Partial<QueueRowPlacementWaitlistCandidateVm> = {},
): QueueRowPlacementWaitlistCandidateVm {
    return {
        placementCandidateId: "pc-a",
        opportunityId: "opp-1",
        childDisplayName: "Child A",
        familyDisplayName: "Family",
        parentDisplayName: "Parent",
        cohortKey: "toddler",
        cohortLabel: "Toddler",
        cohortSectionTitle: "Toddler",
        bucketLabel: "General waitlist",
        waitSinceLabel: "Jan 1",
        linkModeLabel: null,
        isSyntheticFallback: false,
        hasActiveOverride: false,
        activeOverrideKinds: [],
        activeOverrides: [],
        hasManualPositionAdjustment: false,
        manualAdjustmentReason: null,
        pinOverrideId: null,
        shadowMode: false,
        forecastHints: [],
        siblingLabel: null,
        siblingCohorts: [],
        siblingContextLines: [],
        siblingContextDiagnostics: null,
        enrolledSiblings: [],
        waitlistedSiblingCount: 0,
        hasWaitlistedSibling: false,
        hasEnrolledSibling: false,
        householdOtherChildCount: 0,
        householdOtherChildNames: null,
        ...overrides,
    };
}

function previewItem(waitlist: QueueRowPlacementWaitlistCandidateVm): QueuePreviewItemVm {
    return {
        id: "pcrow:opp-1:pc-a",
        title: "Family",
        quickActions: [],
        placementWaitlistCandidate: waitlist,
    };
}

describe("queue row sibling field registry", () => {
    it("registers all sibling vocabulary fields with operator metadata", () => {
        for (const key of QUEUE_ROW_SIBLING_FIELD_KEYS) {
            expect(QUEUE_ROW_SIBLING_FIELD_METADATA[key]?.label.length).toBeGreaterThan(0);
            expect(QUEUE_ROW_SIBLING_FIELD_METADATA[key]?.description.length).toBeGreaterThan(0);
        }
    });

    it("includes sibling fields in validator allow-list and builder catalog", () => {
        const allowed = validatorAllowedQueueRecordFieldRefKeys(true);
        for (const key of QUEUE_ROW_SIBLING_FIELD_KEYS) {
            expect(allowed).toContain(key);
        }
        expect(WAITLIST_PLACEMENT_FIELD_KEYS).toEqual(expect.arrayContaining([...QUEUE_ROW_SIBLING_FIELD_KEYS]));

        const fields = availableFieldsForZone("children", true);
        for (const key of QUEUE_ROW_SIBLING_FIELD_KEYS) {
            expect(fields.map((f) => f.key)).toContain(key);
        }

        const items = buildQueueRowLibraryCatalog({
            isWaitlist: true,
            includeWaitlistFields: true,
            inRowZoneKeys: ["children"],
        });
        const fieldKeys = items.filter((item) => item.kind === "field").map((item) => item.fieldKey);
        for (const key of QUEUE_ROW_SIBLING_FIELD_KEYS) {
            expect(fieldKeys).toContain(key);
        }
        expect(QUEUE_ROW_UNAVAILABLE_SIBLING_LIBRARY).toEqual([]);
    });
});

describe("resolveQueueRowSiblingFields", () => {
    it("maps waitlisted sibling names and count for multi-child family", () => {
        const resolved = resolveQueueRowSiblingFields(
            waitlistVm({
                siblingCohorts: [
                    {
                        placementCandidateId: "pc-b",
                        childDisplayName: "Child B",
                        cohortLabel: "Preschool",
                        linkModeLabel: null,
                    },
                ],
                waitlistedSiblingCount: 1,
                hasWaitlistedSibling: true,
                siblingContextLines: ["Sibling also waitlisted: Child B — Preschool"],
            }),
        );
        expect(resolved["sibling.names"]).toBe("Child B");
        expect(resolved["sibling.count"]).toBe("1");
        expect(resolved["sibling.waitlisted"]).toBe("Child B — Preschool");
        expect(resolved["sibling.program"]).toBe("Preschool");
        expect(resolved["_sibling.hasWaitlisted"]).toBe(true);
    });

    it("maps enrolled sibling program and location", () => {
        const resolved = resolveQueueRowSiblingFields(
            waitlistVm({
                enrolledSiblings: [
                    {
                        childDisplayName: "Jordan",
                        cohortLabel: "Preschool",
                        locationLabel: "North Campus",
                        sameSiteAsCandidate: true,
                    },
                ],
                hasEnrolledSibling: true,
            }),
        );
        expect(resolved["sibling.enrolled"]).toBe("Jordan — Preschool");
        expect(resolved["sibling.location"]).toBe("North Campus");
        expect(resolved["sibling.program"]).toBe("Preschool");
        expect(resolved["_sibling.hasEnrolled"]).toBe(true);
    });

    it("returns empty sibling display fields for single-child row", () => {
        const resolved = resolveQueueRowSiblingFields(waitlistVm());
        expect(resolved["sibling.names"]).toBe("");
        expect(resolved["sibling.count"]).toBe("");
        expect(resolved["sibling.enrolled"]).toBe("");
        expect(resolved["sibling.waitlisted"]).toBe("");
        expect(resolved["_sibling.hasWaitlisted"]).toBe(false);
        expect(resolved["_sibling.hasEnrolled"]).toBe(false);
    });

    it("maps household other children from family membership", () => {
        const resolved = resolveQueueRowSiblingFields(
            waitlistVm({
                householdOtherChildCount: 2,
                householdOtherChildNames: "Lennon · Wrigley",
            }),
        );
        expect(resolved["household.otherChildren"]).toBe("Lennon · Wrigley");
        expect(resolved["_household.hasMultipleChildren"]).toBe(true);
    });
});

describe("buildOpportunityQueueRowRecordFromPreview sibling fields", () => {
    it("projects sibling fields onto waitlist queue row records", () => {
        const record = buildOpportunityQueueRowRecordFromPreview(
            previewItem(
                waitlistVm({
                    childDisplayName: "Child A",
                    siblingCohorts: [
                        {
                            placementCandidateId: "pc-b",
                            childDisplayName: "Child B",
                            cohortLabel: "Preschool",
                            linkModeLabel: null,
                        },
                    ],
                    waitlistedSiblingCount: 1,
                    hasWaitlistedSibling: true,
                    siblingContextLines: ["Sibling also waitlisted: Child B — Preschool"],
                }),
            ),
        );
        expect(record["child.name"]).toBe("Child A");
        expect(record["sibling.names"]).toBe("Child B");
        expect(record["sibling.count"]).toBe("1");
        expect(record["sibling.program"]).toBe("Preschool");
    });

    it("hides sibling fields via hide-when-empty exists conditions on single-child rows", () => {
        const record = buildOpportunityQueueRowRecordFromPreview(previewItem(waitlistVm()));
        expect(
            evaluateLayoutCondition(record, QUEUE_ROW_SIBLING_VISIBILITY_PRESETS.hideWhenEmpty("sibling.names")),
        ).toBe(false);
        expect(
            evaluateLayoutCondition(record, QUEUE_ROW_SIBLING_VISIBILITY_PRESETS.showWhenSiblingWaitlisted),
        ).toBe(false);
    });

    it("shows sibling fields when waitlisted sibling signal is true", () => {
        const record = buildOpportunityQueueRowRecordFromPreview(
            previewItem(
                waitlistVm({
                    hasWaitlistedSibling: true,
                    waitlistedSiblingCount: 1,
                    siblingCohorts: [
                        {
                            placementCandidateId: "pc-b",
                            childDisplayName: "Child B",
                            cohortLabel: "Preschool",
                            linkModeLabel: null,
                        },
                    ],
                }),
            ),
        );
        expect(
            evaluateLayoutCondition(record, QUEUE_ROW_SIBLING_VISIBILITY_PRESETS.showWhenSiblingWaitlisted),
        ).toBe(true);
        expect(
            evaluateLayoutCondition(record, QUEUE_ROW_SIBLING_VISIBILITY_PRESETS.hideWhenEmpty("sibling.names")),
        ).toBe(true);
    });

    it("shows household other children when family has multiple children", () => {
        const record = buildOpportunityQueueRowRecordFromPreview(
            previewItem(
                waitlistVm({
                    householdOtherChildCount: 1,
                    householdOtherChildNames: "Child B",
                }),
            ),
        );
        expect(
            evaluateLayoutCondition(record, QUEUE_ROW_SIBLING_VISIBILITY_PRESETS.showWhenMultipleChildren),
        ).toBe(true);
        expect(record["household.otherChildren"]).toBe("Child B");
    });
});
