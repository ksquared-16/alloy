import { describe, expect, it } from "vitest";

import {
    inferWorkUnitQueueRowLifecycleKey,
    resolveWorkUnitQueueRowPresentationPlan,
    shouldUseOperationalRecordFrame,
} from "@/lib/ui-v2/workUnitQueueRowPresentation";
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

describe("workUnitQueueRowPresentation", () => {
    it("infers waitlist lifecycle from placement preview", () => {
        expect(
            inferWorkUnitQueueRowLifecycleKey({
                waitlistPlacementPreview: mockWaitlistPlacement({
                    priorityRuleLabel: "Infant Priority",
                    scopedWaitlistPosition: 3,
                    scopedWaitlistPositionLabel: "Position #3",
                    priorityReasonShort: "Sibling enrolled",
                }),
            })
        ).toBe("waitlist");
    });

    it("puts operational read inline in header by default", () => {
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
                crmFactGroups: [
                    {
                        kind: "contact",
                        label: "",
                        columnGrid: {
                            headers: ["Contact"],
                            rows: [["Ada Lovelace"]],
                            columnKeys: ["primary_contact"],
                        },
                    },
                ],
            }),
            scanMode: true,
            drawerRecordIconHandlers: {},
            workUnitKey: "enrollment_pipeline",
        });
        expect(plan.headerInline.enrollmentAttention?.inline).toContain("Urgent:");
        expect(plan.headerInline.attentionExpanded).toBe(false);
        expect(plan.bands).not.toContain("attention");
    });

    it("orders parent before children for enrollment lifecycle", () => {
        const plan = resolveWorkUnitQueueRowPresentationPlan({
            slots: baseSlots({
                contactDisplayName: "Kevin Mitchell",
                crmFactGroups: [
                    { kind: "contact", label: "", columnGrid: { headers: ["Contact"], rows: [["Kevin"]], columnKeys: ["primary_contact"] } },
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
        expect(plan.lifecycle).toBe("enrollment");
        expect(plan.people.childrenFirst).toBe(false);
        expect(plan.people.childPrimary).toBe(true);
    });

    it("uses operational record frame for attention-only rows", () => {
        expect(
            shouldUseOperationalRecordFrame({
                slots: baseSlots({
                    operationalReadPreview: {
                        operationalRead: "Follow up today",
                        whyNow: null,
                        urgencyChipLabel: null,
                        urgencyBand: null,
                        typeCue: null,
                        staleCue: null,
                        source: "legacy_why_line",
                        priorityExplanation: null,
                        previewBoundary: "Preview",
                    },
                }),
                scanMode: true,
                drawerRecordIconHandlers: {},
            })
        ).toBe(true);
    });
});
