import { describe, expect, it } from "vitest";

import {
    buildAttentionExpandedDetail,
    buildEnrollmentHeaderAttentionInline,
    buildEnrollmentHeaderSubline,
    deriveConciseAttentionSummary,
    buildWaitlistHeaderInlineFromPlacement,
    QUEUE_ROW_HEADER_INLINE_ATTENTION_MAX,
    sanitizeOperatorReasonDetail,
    shouldExpandAttentionBandFromDetail,
} from "@/lib/ui-v2/workUnitQueueRowHeaderPresentation";
import { resolveWorkUnitQueueRowPresentationPlan } from "@/lib/ui-v2/workUnitQueueRowPresentation";
import type { CrmCompactRowSemanticSlots, QueueRowPlacementPriorityVm } from "@/lib/ui-v2/workspace-types";

function mockWaitlistPlacement(
    partial: Partial<QueueRowPlacementPriorityVm> = {}
): QueueRowPlacementPriorityVm {
    return {
        priorityRuleLabel: "Infant Priority",
        programGroupSectionTitle: "Infant waitlist",
        waitlistProgramShortLabel: "Infant",
        reasonLines: [],
        warningLines: [],
        shadowMode: false,
        evaluateError: false,
        ...partial,
    };
}

function baseSlots(partial: Partial<CrmCompactRowSemanticSlots> = {}): CrmCompactRowSemanticSlots {
    return {
        primaryIdentity: "Smith Family",
        childName: null,
        stageLabel: null,
        statusLabel: null,
        nextStep: null,
        lastActivity: null,
        commercialValue: null,
        contactSnippet: null,
        programContext: null,
        roomContext: null,
        ageContext: null,
        attentionReason: null,
        familyNote: null,
        ...partial,
    };
}

describe("workUnitQueueRowHeaderPresentation", () => {
    it("derives concise operator attention summary from catalog headline", () => {
        expect(
            deriveConciseAttentionSummary("Complete the overdue follow-up and log the next step")
        ).toBe("overdue follow-up");
    });

    it("sanitizes internal reason fragments for operators", () => {
        expect(sanitizeOperatorReasonDetail("Commitment date passed · breached vs goal")).toBe(
            "Commitment date missed"
        );
    });

    it("builds compact enrollment inline attention with urgency prefix", () => {
        const built = buildEnrollmentHeaderAttentionInline(
            baseSlots({
                operationalReadPreview: {
                    operationalRead: "Complete the overdue follow-up and log the next step",
                    whyNow: "Commitment date passed",
                    urgencyChipLabel: "Urgent",
                    urgencyBand: "p0_urgent",
                    typeCue: null,
                    staleCue: null,
                    source: "legacy_why_line",
                    priorityExplanation: null,
                    previewBoundary: "Preview",
                },
            })
        );
        expect(built.inline).toBe("Urgent: overdue follow-up");
        expect(built.headlineSummary).toBe("overdue follow-up");
    });

    it("truncates inline attention beyond max chars", () => {
        const long = "x".repeat(QUEUE_ROW_HEADER_INLINE_ATTENTION_MAX + 10);
        const built = buildEnrollmentHeaderAttentionInline(
            baseSlots({
                operationalReadPreview: {
                    operationalRead: long,
                    whyNow: null,
                    urgencyChipLabel: null,
                    urgencyBand: null,
                    typeCue: null,
                    staleCue: null,
                    source: "legacy_why_line",
                    priorityExplanation: null,
                    previewBoundary: "Preview",
                },
            })
        );
        expect(built.inline!.length).toBeLessThanOrEqual(QUEUE_ROW_HEADER_INLINE_ATTENTION_MAX);
    });

    it("builds header subline with reason and next step without repeating headline", () => {
        const headerInline = buildEnrollmentHeaderAttentionInline(
            baseSlots({
                operationalReadPreview: {
                    operationalRead: "Complete the overdue follow-up",
                    whyNow: "Commitment date passed · breached vs goal",
                    urgencyChipLabel: "Urgent",
                    urgencyBand: "p0_urgent",
                    typeCue: null,
                    staleCue: null,
                    source: "legacy_why_line",
                    priorityExplanation: null,
                    previewBoundary: "Preview",
                },
                nextStep: "Call family within one business day to confirm interest.",
            })
        );
        const detail = buildAttentionExpandedDetail(
            baseSlots({
                operationalReadPreview: {
                    operationalRead: "Complete the overdue follow-up",
                    whyNow: "Commitment date passed · breached vs goal",
                    urgencyChipLabel: "Urgent",
                    urgencyBand: "p0_urgent",
                    typeCue: null,
                    staleCue: null,
                    source: "legacy_why_line",
                    priorityExplanation: null,
                    previewBoundary: "Preview",
                },
                nextStep: "Call family within one business day to confirm interest.",
            }),
            headerInline
        );
        expect(detail.reasonDetail).toBe("Commitment date missed");
        expect(detail.nextStepLine).toBe(
            "Next step: Call family within one business day to confirm interest."
        );
        expect(detail.nextStepLine).not.toContain("Next stepCall");
        expect(shouldExpandAttentionBandFromDetail(detail)).toBe(false);
        expect(buildEnrollmentHeaderSubline(detail, false)).toBe(
            "Commitment date missed · Next step: Call family within one business day to confirm interest."
        );
    });

    it("expands attention band only for exceptional multi-warning rows", () => {
        const detail = buildAttentionExpandedDetail(
            baseSlots({
                operationalReadPreview: {
                    operationalRead: "overdue follow-up",
                    whyNow: "Commitment date passed",
                    urgencyChipLabel: "Urgent",
                    urgencyBand: "p0_urgent",
                    typeCue: "Escalation",
                    staleCue: null,
                    source: "legacy_why_line",
                    priorityExplanation: null,
                    previewBoundary: "Preview",
                },
                nextStep: "Call family.",
            }),
            null
        );
        expect(shouldExpandAttentionBandFromDetail(detail)).toBe(true);
        expect(buildEnrollmentHeaderSubline(detail, true)).toBeNull();
    });

    it("builds waitlist ranking chip with position and category", () => {
        const built = buildWaitlistHeaderInlineFromPlacement(
            mockWaitlistPlacement({
                scopedWaitlistPosition: 1,
                priorityRuleLabel: "Standard Family",
                priorityReasonShort: "Sibling enrolled in Toddler",
            })
        );
        expect(built.rankingChip).toBe("#1 Standard Family");
        expect(built.reasonShort).toBe("Sibling enrolled in Toddler");
    });
});

describe("resolveWorkUnitQueueRowPresentationPlan V3.2", () => {
    it("uses header subline instead of attention band for normal supplemental detail", () => {
        const slots = baseSlots({
            stageLabel: "Contact",
            statusLabel: "Attempted",
            locationContext: "South Campus",
            operationalReadPreview: {
                operationalRead: "overdue follow-up",
                whyNow: "Commitment date passed · breached vs goal",
                urgencyChipLabel: "Urgent",
                urgencyBand: "p0_urgent",
                typeCue: null,
                staleCue: null,
                source: "legacy_why_line",
                priorityExplanation: null,
                previewBoundary: "Preview",
            },
            nextStep: "Call family within one business day to confirm interest.",
        });
        const plan = resolveWorkUnitQueueRowPresentationPlan({
            slots,
            scanMode: true,
            drawerRecordIconHandlers: {},
            workUnitKey: "enrollment_pipeline",
        });
        expect(plan.headerInline.enrollmentAttention?.inline).toContain("Urgent:");
        expect(plan.headerInline.enrollmentSubline).toContain("Commitment date missed");
        expect(plan.headerInline.enrollmentSubline).toContain("Next step:");
        expect(plan.headerInline.attentionExpanded).toBe(false);
        expect(plan.bands).not.toContain("attention");
    });

    it("omits header subline when only inline summary exists", () => {
        const plan = resolveWorkUnitQueueRowPresentationPlan({
            slots: baseSlots({
                operationalReadPreview: {
                    operationalRead: "overdue follow-up",
                    whyNow: null,
                    urgencyChipLabel: "Urgent",
                    urgencyBand: "p0_urgent",
                    typeCue: null,
                    staleCue: null,
                    source: "legacy_why_line",
                    priorityExplanation: null,
                    previewBoundary: "Preview",
                },
            }),
            scanMode: true,
            drawerRecordIconHandlers: {},
            workUnitKey: "enrollment_pipeline",
        });
        expect(plan.headerInline.enrollmentSubline).toBeNull();
        expect(plan.headerInline.attentionExpanded).toBe(false);
        expect(plan.bands).not.toContain("attention");
    });

    it("orders parent before children in people band", () => {
        const plan = resolveWorkUnitQueueRowPresentationPlan({
            slots: baseSlots({
                contactDisplayName: "Kevin Mitchell",
                crmFactGroups: [
                    {
                        kind: "children_programs",
                        label: "",
                        columnGrid: {
                            headers: ["Child", "Program"],
                            rows: [["Liam (2y)", "Toddler"]],
                            columnKeys: ["child_name", "program"],
                        },
                    },
                ],
            }),
            scanMode: true,
            drawerRecordIconHandlers: {},
            workUnitKey: "enrollment_pipeline",
        });
        expect(plan.people.childrenFirst).toBe(false);
    });

    it("omits lifecycle band for waitlist when ranking fits header", () => {
        const plan = resolveWorkUnitQueueRowPresentationPlan({
            slots: baseSlots({
                primaryIdentity: "Williams Family",
                statusLabel: "Waitlisted",
                locationContext: "North Campus",
            }),
            scanMode: true,
            drawerRecordIconHandlers: {},
            workUnitKey: "waitlist",
            waitlistPlacementPreview: mockWaitlistPlacement({
                scopedWaitlistPosition: 1,
                priorityRuleLabel: "Standard Family",
                priorityReasonShort: "Sibling priority · Desired start approaching",
            }),
        });
        expect(plan.headerInline.waitlist?.rankingChip).toBe("#1 Standard Family");
        expect(plan.headerInline.lifecycleExpanded).toBe(false);
        expect(plan.bands).not.toContain("lifecycle");
    });
});
