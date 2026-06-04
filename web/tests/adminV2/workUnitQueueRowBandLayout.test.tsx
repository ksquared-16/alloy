import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CrmCompactQueuePreview } from "@/app/adminV2/components/workspace/blocks/QueueBlock";
import { resolveQueueOperationalReadSlot } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import type { CrmCompactRowSemanticSlots, QueueRowPlacementPriorityVm } from "@/lib/ui-v2/workspace-types";

function mockWaitlistPlacement(
    partial: Partial<QueueRowPlacementPriorityVm> = {}
): QueueRowPlacementPriorityVm {
    return {
        priorityRuleLabel: "Sibling Priority",
        programGroupSectionTitle: "Infant waitlist",
        waitlistProgramShortLabel: "Infant",
        reasonLines: [],
        warningLines: [],
        shadowMode: false,
        evaluateError: false,
        ...partial,
    };
}

function crmTestSlots(
    partial: Partial<CrmCompactRowSemanticSlots> & Pick<CrmCompactRowSemanticSlots, "primaryIdentity">
): CrmCompactRowSemanticSlots {
    return {
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

const handlers = {
    onOpenPerson: vi.fn(),
    onOpenChild: vi.fn(),
    onPrefetchPerson: vi.fn(),
    onPrefetchChild: vi.fn(),
};

describe("operational record V3.2 compact header", () => {
    it("renders household before status in header order", () => {
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                workUnitKey="enrollment_pipeline"
                drawerRecordIconHandlers={handlers}
                slots={crmTestSlots({
                    primaryIdentity: "Mitchell household",
                    stageLabel: "Contact",
                    statusLabel: "Attempted",
                    locationContext: "South Campus",
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
                })}
            />
        );
        const householdIdx = html.indexOf('data-testid="queue-header-household"');
        const statusIdx = html.indexOf('data-testid="queue-header-status"');
        expect(householdIdx).toBeGreaterThan(-1);
        expect(statusIdx).toBeGreaterThan(householdIdx);
        expect(html).toContain('adminv2-ws-crm-queue-preview__status-pill--secondary');
        expect(html).toContain("Mitchell household");
    });

    it("shows concise attention in header line 1 and reason/next step in line 2 without supplement band", () => {
        const slot = resolveQueueOperationalReadSlot({
            _operational_recommendation_preview: {
                next_label: "Complete the overdue follow-up and log the next step",
                why_line: "Commitment date passed · breached vs goal",
                urgency_band: "p0_urgent",
            },
        });
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                workUnitKey="enrollment_pipeline"
                drawerRecordIconHandlers={handlers}
                slots={crmTestSlots({
                    primaryIdentity: "Mitchell household",
                    stageLabel: "Contact",
                    statusLabel: "Attempted",
                    locationContext: "South Campus",
                    nextStep: "Call family within one business day to confirm interest.",
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
                    operationalReadPreview: slot,
                })}
            />
        );
        expect(html).toContain('data-testid="queue-header-attention-inline"');
        expect(html).toContain("Urgent: overdue follow-up");
        expect(html).toContain('data-testid="queue-header-enrollment-subline"');
        expect(html).toContain("Commitment date missed");
        expect(html).toContain("Next step: Call family within one business day to confirm interest.");
        expect(html).not.toContain("Next stepCall");
        expect(html).not.toContain("breached vs goal");
        expect(html).not.toContain('data-queue-attention-supplement="true"');
        expect(html).not.toContain('data-queue-preview-slot="operational_read"');
        expect(html).not.toContain('data-testid="queue-operational-read-urgency-chip"');
        expect(html).not.toContain("Complete the overdue follow-up");
    });

    it("renders waitlist ranking inline in header with optional reason subline", () => {
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                workUnitKey="waitlist"
                drawerRecordIconHandlers={handlers}
                waitlistPlacementPreview={mockWaitlistPlacement({
                    priorityRuleLabel: "Standard Family",
                    scopedWaitlistPosition: 1,
                    priorityReasonShort: "Sibling priority · Desired start approaching",
                })}
                slots={crmTestSlots({
                    primaryIdentity: "Williams Family",
                    statusLabel: "Waitlisted",
                    locationContext: "North Campus",
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
                })}
            />
        );
        expect(html).toContain('data-testid="queue-header-waitlist-ranking"');
        expect(html).toContain("#1 Standard Family");
        expect(html).toContain('data-testid="queue-header-waitlist-reason"');
        expect(html).toContain("Sibling priority");
        expect(html).not.toContain('data-queue-row-band="lifecycle"');
    });

    it("renders waitlist child drawer icon when child person id exists", () => {
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                workUnitKey="waitlist"
                drawerRecordIconHandlers={handlers}
                waitlistPlacementPreview={mockWaitlistPlacement({
                    priorityRuleLabel: "Standard Family",
                    scopedWaitlistPosition: 1,
                })}
                slots={crmTestSlots({
                    primaryIdentity: "Williams Family",
                    statusLabel: "Waitlisted",
                    locationContext: "North Campus",
                    childPersonId: "child-waitlist-1",
                    childrenLines: [{ primary: "Liam (2y)", personId: "child-waitlist-1", programInline: "Toddler" }],
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
                })}
            />
        );
        expect(html).toContain('data-queue-row-child-icon="true"');
        expect(html).toMatch(/data-queue-row-child-icon="true"[\s\S]*Liam \(2y\)/);
    });

    it("stays compact for three-child household", () => {
        const childRows = ["A (1y)", "B (2y)", "C (3y)"].map((name) => [name, "Program"]);
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                workUnitKey="enrollment_pipeline"
                drawerRecordIconHandlers={handlers}
                slots={crmTestSlots({
                    primaryIdentity: "Three Child Family",
                    contactDisplayName: "Parent Name",
                    contactPersonId: "parent-1",
                    crmFactGroups: [
                        {
                            kind: "children_programs",
                            label: "",
                            columnGrid: {
                                headers: ["Child", "Program"],
                                rows: childRows,
                                columnKeys: ["child_name", "program"],
                            },
                        },
                    ],
                })}
            />
        );
        expect(html).toContain("A (1y)");
        expect(html).toContain("C (3y)");
        expect(html).not.toContain('data-queue-attention-supplement="true"');
    });

    it("stays compact for five-child household", () => {
        const childRows = ["A (1y)", "B (2y)", "C (3y)", "D (4y)", "E (5y)"].map((name) => [name, "Program"]);
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                workUnitKey="enrollment_pipeline"
                drawerRecordIconHandlers={handlers}
                slots={crmTestSlots({
                    primaryIdentity: "Large Family",
                    contactDisplayName: "Parent Name",
                    contactPersonId: "parent-1",
                    crmFactGroups: [
                        {
                            kind: "children_programs",
                            label: "",
                            columnGrid: {
                                headers: ["Child", "Program"],
                                rows: childRows,
                                columnKeys: ["child_name", "program"],
                            },
                        },
                    ],
                })}
            />
        );
        expect(html).toContain("A (1y)");
        expect(html).toContain("E (5y)");
        expect(html).toContain('data-queue-people-role="children"');
        expect(html).not.toContain('data-queue-attention-supplement="true"');
    });

    it("renders parent above children with readable contact meta", () => {
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                workUnitKey="enrollment_pipeline"
                drawerRecordIconHandlers={handlers}
                slots={crmTestSlots({
                    primaryIdentity: "Mitchell Family",
                    contactDisplayName: "Kevin Mitchell",
                    contactPhoneDisplay: "(503) 555-4729",
                    contactEmail: "kevin@email.com",
                    contactPersonId: "parent-1",
                    crmFactGroups: [
                        {
                            kind: "children_programs",
                            label: "",
                            columnGrid: {
                                headers: ["Child", "Program"],
                                rows: [["Liam Mitchell (2y)", "Toddler"]],
                                columnKeys: ["child_name", "program"],
                            },
                        },
                    ],
                })}
            />
        );
        const parentIdx = html.indexOf("Kevin Mitchell");
        const childIdx = html.indexOf("Liam Mitchell (2y)");
        expect(parentIdx).toBeGreaterThan(-1);
        expect(childIdx).toBeGreaterThan(-1);
        expect(parentIdx).toBeLessThan(childIdx);
        expect(html).toContain("(503) 555-4729");
        expect(html).toContain("kevin@email.com");
        expect(html).toContain('data-queue-people-role="parent"');
    });

    it("stays compact for one-child household", () => {
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                workUnitKey="enrollment_pipeline"
                drawerRecordIconHandlers={handlers}
                slots={crmTestSlots({
                    primaryIdentity: "Single Child Family",
                    contactDisplayName: "Parent Name",
                    contactPersonId: "parent-1",
                    childrenLines: [{ primary: "Sam (4y)", personId: "child-1", programInline: "Preschool" }],
                    crmFactGroups: [
                        {
                            kind: "children_programs",
                            label: "",
                            columnGrid: {
                                headers: ["Child", "Program"],
                                rows: [["Sam (4y)", "Preschool"]],
                                columnKeys: ["child_name", "program"],
                            },
                        },
                    ],
                })}
            />
        );
        expect(html).toContain("Sam (4y)");
        expect(html).toContain('data-queue-header-layout="two-line"');
        expect(html).not.toContain('data-queue-attention-supplement="true"');
    });
});
