/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    queueRowVariantMatchInputFromContext,
    resolveQueueRowCompactSlots,
    resolveQueueRowPresentation,
} from "@/lib/presentation/runtime/queueRowVariantResolve";
import { resolveQueueRowVariant } from "@/lib/presentation/runtime/resolveQueueRowVariant";
import { starterEnrollmentQueueRowVariants } from "@/lib/layout/queueRecordLayoutDefaults";
import type { QueueRecordColumnConfig, QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import { QUEUE_ROW_SIBLING_VISIBILITY_PRESETS } from "@/lib/layout/runtime/queueRowSiblingFieldRegistry";
import type { QueuePreviewItemVm, QueueRowPlacementWaitlistCandidateVm } from "@/lib/ui-v2/workspace-types";

function statusColumn(statusLabel: string): QueueRecordColumnConfig {
    return {
        id: `col-${statusLabel.replace(/\s+/g, "-").toLowerCase()}`,
        label: "",
        width: "status_band",
        scope: { type: "lifecycle_context" },
        blocks: [
            {
                type: "field_group",
                id: `grp-${statusLabel}`,
                fields: [
                    { id: `f-${statusLabel}`, fieldKey: "opportunity.status_label", label: statusLabel, display: "pill" },
                ],
            },
        ],
    };
}

function enrollmentConfigWithVariantColumns(): QueueRecordLayoutConfigV3 {
    const variants = starterEnrollmentQueueRowVariants().map((variant) => ({
        ...variant,
        columns: [statusColumn(`${variant.label} variant`)],
    }));
    return {
        variant: "operational-row",
        version: 3,
        columns: [statusColumn("Default — New Leads")],
        fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
        variants,
    };
}

function rowContext(over: Partial<QueueRowContext> & Pick<QueueRowContext, "row_subject">): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        case_context: {
            case_id: "opp-1",
            display_name: "Family",
            case_type_label: "Enrollment",
            case_status_key: "open",
            case_status_label: "Active",
        },
        primary_contact: { display_name: "Parent" },
        related_subjects_summary: [],
        row_status_key: null,
        lifecycle_key: "enrollment",
        drawer_open: null,
        ...over,
    } as QueueRowContext;
}

function waitlistVm(over: Partial<QueueRowPlacementWaitlistCandidateVm> = {}): QueueRowPlacementWaitlistCandidateVm {
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
        ...over,
    };
}

describe("queue row runtime closeout — variant consumption", () => {
    const config = enrollmentConfigWithVariantColumns();

    it("New Leads / unmatched stage uses top-level Default columns", () => {
        const input = queueRowVariantMatchInputFromContext(
            rowContext({
                row_subject: { subject_type: "case", subject_id: "opp-1", display_name: "Nguyen Family" },
                drawer_open: { entity_type: "opportunities", entity_id: "opp-1", stage_focus_key: "lead" },
            }),
            { workViewId: "wv-new-leads" },
        );
        expect(input.stageKey).toBe("lead");
        expect(resolveQueueRowVariant(config.variants, input)).toBeNull();
        expect(resolveQueueRowCompactSlots(config, input).status.label).toBe("Default — New Leads");
    });

    it("Waitlist work view selects Waitlist variant for candidate-grain rows", () => {
        const context = rowContext({
            row_subject: { subject_type: "candidate", subject_id: "pc-1", display_name: "Mia" },
            row_status_key: "waitlisted",
            drawer_open: { entity_type: "opportunities", entity_id: "opp-1", stage_focus_key: "waitlist" },
        });
        const input = queueRowVariantMatchInputFromContext(context, { workViewKey: "waitlist" });
        expect(input).toMatchObject({ grain: "candidate", stageKey: "waitlist", statusKey: "waitlisted" });
        expect(resolveQueueRowVariant(config.variants, input)?.label).toBe("Waitlist");
        expect(resolveQueueRowCompactSlots(config, input).status.label).toBe("Waitlist variant");
    });

    it("Enrolling work view selects Enrolling variant when stage matches", () => {
        const input = queueRowVariantMatchInputFromContext(
            rowContext({
                row_subject: { subject_type: "child", subject_id: "child-1", display_name: "Noah" },
                drawer_open: { entity_type: "opportunities", entity_id: "opp-1", stage_focus_key: "enrolling" },
            }),
            { workViewKey: "enrolling" },
        );
        expect(resolveQueueRowVariant(config.variants, input)?.label).toBe("Enrolling");
        expect(resolveQueueRowCompactSlots(config, input).status.label).toBe("Enrolling variant");
    });

    it("falls back to Default columns when no configured variant matches", () => {
        const input = { stageKey: "archived", grain: "case" };
        expect(resolveQueueRowVariant(config.variants, input)).toBeNull();
        expect(resolveQueueRowCompactSlots(config, input).status.label).toBe("Default — New Leads");
    });

    it("resolveQueueRowPresentation applies variant subjectFocus only when declared", () => {
        const candidate = rowContext({
            row_subject: { subject_type: "candidate", subject_id: "pc-1", display_name: "Mia" },
            drawer_open: { entity_type: "opportunities", entity_id: "opp-1", stage_focus_key: "waitlist" },
        });
        const { focus } = resolveQueueRowPresentation(config, candidate, { grain: "candidate", stageKey: "waitlist" });
        expect(focus?.focus).toBe("placement_candidate_child");
    });
});

describe("queue row runtime closeout — sibling field rendering", () => {
    it("hides sibling fields for single-child waitlist rows via visibleWhen exists", () => {
        const record = buildOpportunityQueueRowRecordFromPreview({
            id: "pcrow:opp-1:pc-a",
            title: "Family",
            quickActions: [],
            placementWaitlistCandidate: waitlistVm(),
        });
        expect(record["sibling.names"]).toBe("");
        expect(record["sibling.count"]).toBe("");
        expect(
            evaluateLayoutCondition(record, QUEUE_ROW_SIBLING_VISIBILITY_PRESETS.hideWhenEmpty("sibling.names")),
        ).toBe(false);
        expect(
            evaluateLayoutCondition(record, QUEUE_ROW_SIBLING_VISIBILITY_PRESETS.hideWhenEmpty("sibling.count")),
        ).toBe(false);
    });

    it("shows resolver-backed sibling fields for multi-child waitlist candidate rows", () => {
        const record = buildOpportunityQueueRowRecordFromPreview({
            id: "pcrow:opp-1:pc-a",
            title: "Family",
            quickActions: [],
            placementWaitlistCandidate: waitlistVm({
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
                householdOtherChildCount: 1,
                householdOtherChildNames: "Child B",
            }),
        });
        expect(record["child.name"]).toBe("Child A");
        expect(record["sibling.names"]).toBe("Child B");
        expect(record["sibling.count"]).toBe("1");
        expect(record["sibling.names"]).not.toMatch(/Lennon|Wrigley|placeholder/i);
        expect(
            evaluateLayoutCondition(record, QUEUE_ROW_SIBLING_VISIBILITY_PRESETS.hideWhenEmpty("sibling.names")),
        ).toBe(true);
    });

    it("does not use builder-only values at runtime — sibling data comes from preview VM only", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-pipeline",
            title: "Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Family",
                childName: "Alex",
                contactDisplayName: null,
                contactPersonId: null,
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "Lead",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                childrenLines: [],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(record["sibling.names"]).toBeUndefined();
        expect(record["sibling.count"]).toBeUndefined();
    });
});
