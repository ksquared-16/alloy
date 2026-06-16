import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CrmCompactQueuePreview } from "@/app/adminV2/components/workspace/blocks/QueueBlock";
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
        currentWorkLine: null,
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

describe("operational record V3.4 visual hierarchy", () => {
    it("renders enrollment pipeline rows as horizontal operational columns", () => {
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
                    contactDisplayName: "Kevin Mitchell",
                    contactPhoneDisplay: "(503) 555-4729",
                    contactPersonId: "parent-1",
                    nextStep: "Call family within one business day to confirm interest.",
                    attentionReason: "Urgent: overdue follow-up",
                    operationalReadPreview: {
                        operationalRead: "overdue follow-up",
                        whyNow: "Commitment date passed",
                        urgencyChipLabel: "Urgent",
                        urgencyBand: "p0_urgent",
                        typeCue: null,
                        staleCue: null,
                        source: "legacy_why_line",
                        priorityExplanation: null,
                        previewBoundary: "Preview",
                    },
                    childrenLines: [{ primary: "Liam (2y)", personId: "child-1", programInline: "Toddler" }],
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
                        {
                            kind: "timing",
                            label: "Timing",
                            lines: ["Tour: Thu 3/12 · Desired start: Apr 2026"],
                        },
                    ],
                })}
            />
        );
        const identityIdx = html.indexOf('data-queue-col-scope="main_record"');
        const relatedIdx = html.indexOf('data-queue-col-scope="repeated_related"');
        const statusIdx = html.indexOf("queue-record-field--pill");
        const attentionIdx = html.indexOf("queue-record-widget--attention");
        expect(identityIdx).toBeGreaterThan(-1);
        expect(relatedIdx).toBeGreaterThan(identityIdx);
        expect(statusIdx).toBeGreaterThan(relatedIdx);
        expect(attentionIdx).toBeGreaterThan(statusIdx);
        expect(html).toContain('data-queue-record-layout="operational-row"');
        expect(html).toContain("queue-record-field--link");
        expect(html).not.toContain('data-queue-attention-supplement="true"');
    });

    it("renders waitlist rows on the operational column model", () => {
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                workUnitKey="waitlist"
                drawerRecordIconHandlers={handlers}
                waitlistPlacementPreview={mockWaitlistPlacement({
                    priorityRuleLabel: "Standard Family",
                    scopedWaitlistPosition: 1,
                    priorityReasonShort: "Sibling also waitlisted: Riley Williams — Toddler",
                })}
                slots={crmTestSlots({
                    primaryIdentity: "Williams Family",
                    statusLabel: "Waitlisted",
                    locationContext: "North Campus",
                    contactDisplayName: "Riley Williams",
                    contactPersonId: "parent-wl",
                    childrenLines: [{ primary: "Sam (3y)", personId: "child-wl", programInline: "Toddler" }],
                    crmFactGroups: [
                        {
                            kind: "children_programs",
                            label: "",
                            columnGrid: {
                                headers: ["Child", "Program"],
                                rows: [["Sam (3y)", "Toddler"]],
                                columnKeys: ["child_name", "program"],
                            },
                        },
                    ],
                })}
            />
        );
        expect(html).toContain('data-queue-record-layout="operational-row"');
        expect(html).toContain('data-queue-col-scope="main_record"');
        expect(html).toContain('data-queue-col-scope="repeated_related"');
        expect(html).toContain("Waitlisted");
        expect(html).toContain("Sam");
        expect(html).toContain("queue-record-field--link");
        const parentIdx = html.indexOf("Riley Williams");
        const childIdx = html.indexOf(">Sam<");
        expect(parentIdx).toBeGreaterThan(-1);
        expect(childIdx).toBeGreaterThan(-1);
        expect(parentIdx).toBeLessThan(childIdx);
    });
});

describe("operational record V3.2 compact header", () => {
    it("renders household in identity column before status column", () => {
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
                    childrenLines: [{ primary: "Liam (2y)", personId: "child-1", programInline: "Toddler" }],
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
        const householdIdx = html.indexOf("Mitchell household");
        const statusIdx = html.indexOf("queue-record-field--pill");
        expect(householdIdx).toBeGreaterThan(-1);
        expect(statusIdx).toBeGreaterThan(householdIdx);
        expect(html).toContain('data-queue-col-scope="main_record"');
        expect(html).toContain("Attempted");
        expect(html).not.toContain("Contact · Attempted");
    });

    it("shows attention reason and next step in attention column without supplement band", () => {
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
                    attentionReason: "Urgent: overdue follow-up",
                    nextStep: "Call family within one business day to confirm interest.",
                    childrenLines: [{ primary: "Liam (2y)", personId: "child-1", secondary: "2y" }],
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
        expect(html).toContain("queue-record-widget--attention");
        expect(html).toContain("queue-record-field--next-step");
        expect(html).toContain("Urgent: overdue follow-up");
        expect(html).toContain("Call family within one business day to confirm interest.");
        expect(html).toMatch(/queue-record-field--next-step[\s\S]*Next:/);
        expect(html).not.toContain('data-queue-attention-supplement="true"');
        expect(html).not.toContain('data-queue-preview-slot="operational_read"');
        expect(html).not.toContain('data-testid="queue-operational-read-urgency-chip"');
    });

    it("maps waitlist placement context into status column", () => {
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
        expect(html).toContain("queue-record-field--pill");
        expect(html).toContain("Waitlisted");
        expect(html).toContain("North Campus");
        expect(html).not.toContain('data-queue-row-band="lifecycle"');
    });

    it("renders waitlist candidate adjustment controls in lifecycle band with header subline", () => {
        const waitlistCandidate: import("@/lib/ui-v2/workspace-types").QueueRowPlacementWaitlistCandidateVm = {
            placementCandidateId: "pc-wl-1",
            opportunityId: "opp-wl-1",
            childDisplayName: "Sam (3y)",
            familyDisplayName: "Williams Family",
            parentDisplayName: "Riley Williams",
            cohortKey: "toddler",
            cohortLabel: "Toddler",
            cohortSectionTitle: "Toddler Waitlist",
            bucketLabel: "Standard family",
            waitSinceLabel: "06/15/2024",
            linkModeLabel: null,
            isSyntheticFallback: false,
            hasActiveOverride: false,
            activeOverrideKinds: [],
            activeOverrides: [],
            hasManualPositionAdjustment: false,
            manualAdjustmentReason: null,
            pinOverrideId: null,
            shadowMode: false,
            runtimePosition: 1,
            runtimePositionTotal: 8,
            runtimePositionLabel: "Preview position 1/8",
            forecastHints: [],
            siblingLabel: "1 sibling also waitlisted",
            siblingCohorts: [],
            siblingContextLines: ["Sibling also waitlisted: Riley Williams — Toddler"],
            siblingContextDiagnostics: null,
        };
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                workUnitKey="waitlist"
                drawerRecordIconHandlers={handlers}
                waitlistCandidateRow={waitlistCandidate}
                slots={crmTestSlots({
                    primaryIdentity: "Williams Family",
                    statusLabel: "Waitlisted",
                    locationContext: "North Campus",
                    contactDisplayName: "Riley Williams",
                    contactPersonId: "parent-wl",
                    childrenLines: [{ primary: "Sam (3y)", personId: "child-wl", programInline: "Toddler" }],
                    crmFactGroups: [
                        {
                            kind: "children_programs",
                            label: "",
                            columnGrid: {
                                headers: ["Child", "Program"],
                                rows: [["Sam (3y)", "Toddler"]],
                                columnKeys: ["child_name", "program"],
                            },
                        },
                        {
                            kind: "timing",
                            label: "Timing",
                            lines: ["Desired start: Apr 2026"],
                        },
                    ],
                })}
            />
        );
        expect(html).toContain('data-queue-record-layout="operational-row"');
        expect(html).toContain("Williams Family");
        expect(html).toContain("Sam");
        expect(html).toContain("Riley Williams");
        expect(html).toContain("Waitlisted");
        expect(html).toContain("queue-record-field--link");
        expect(html).not.toContain('data-queue-row-band="lifecycle"');
        expect(html).not.toContain('data-queue-placement="candidate-meta"');
        expect(html).not.toContain('data-queue-placement="candidate-context"');
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
        expect(html).toContain("queue-record-field--link");
        expect(html).toContain("Liam");
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
                    childrenLines: childRows.map(([name]) => ({ primary: name, personId: `child-${name}` })),
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
        expect(html).toContain(">A<");
        expect(html).toContain(">C<");
        expect(html).toContain("queue-record-field--link");
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
                    childrenLines: childRows.map(([name]) => ({ primary: name, personId: `child-${name}` })),
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
        expect(html).toContain(">A<");
        expect(html).toContain(">E<");
        expect(html).toContain('data-queue-col-scope="repeated_related"');
        expect(html).not.toContain('data-queue-attention-supplement="true"');
    });

    it("renders parent in identity column and child chips in related column", () => {
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
                    childrenLines: [{ primary: "Liam Mitchell (2y)", personId: "child-1", programInline: "Toddler" }],
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
        const identityIdx = html.indexOf('data-queue-col-scope="main_record"');
        const relatedIdx = html.indexOf('data-queue-col-scope="repeated_related"');
        const parentIdx = html.indexOf("Kevin Mitchell");
        const childIdx = html.indexOf("Liam Mitchell");
        expect(identityIdx).toBeGreaterThan(-1);
        expect(relatedIdx).toBeGreaterThan(identityIdx);
        expect(parentIdx).toBeGreaterThan(-1);
        expect(childIdx).toBeGreaterThan(-1);
        expect(html).toContain("(503) 555-4729");
        expect(html).toContain("kevin@email.com");
        expect(html).toContain("queue-record-field--link");
        expect(html).toContain("queue-record-field--link");
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
        expect(html).toContain(">Sam<");
        expect(html).toContain('data-queue-record-layout="operational-row"');
        expect(html).not.toContain('data-queue-attention-supplement="true"');
    });
});
