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

describe("operational record V3.4 visual hierarchy", () => {
    it("groups row into summary, people, and facts zones in scan order", () => {
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
        const summaryIdx = html.indexOf('data-queue-zone="summary"');
        const peopleIdx = html.indexOf('data-queue-zone="people"');
        const factsIdx = html.indexOf('data-queue-zone="facts"');
        expect(summaryIdx).toBeGreaterThan(-1);
        expect(peopleIdx).toBeGreaterThan(summaryIdx);
        expect(factsIdx).toBeGreaterThan(peopleIdx);
        expect(html).toContain('data-queue-header-container="true"');
        expect(html).not.toContain('data-queue-attention-supplement="true"');
    });

    it("applies waitlist summary and people hierarchy with same zone model", () => {
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
        expect(html).toContain('data-queue-zone="summary"');
        expect(html).toContain("#1 Standard Family");
        expect(html).toContain("Sibling also waitlisted");
        expect(html).toMatch(
            /data-testid="queue-header-attention-column"[\s\S]*data-testid="queue-header-waitlist-reason"/
        );
        expect(html).toContain('data-queue-zone="people"');
        expect(html).toContain('data-queue-row-child-icon="true"');
        const parentIdx = html.indexOf("Riley Williams");
        const childIdx = html.indexOf("Sam (3y)");
        expect(parentIdx).toBeLessThan(childIdx);
    });
});

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
        expect(html).toContain('data-queue-header-layout="attention-column"');
        expect(html).toContain('data-testid="queue-header-household-icon"');
        expect(html).toContain("Mitchell household");
    });

    it("shows concise attention in header column row 1 and reason/next step in column row 2 without supplement band", () => {
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
        expect(html).toContain('data-queue-header-container="true"');
        expect(html).toContain('data-testid="queue-header-attention-column"');
        expect(html).toContain('data-testid="queue-header-enrollment-subline"');
        expect(html).toContain('adminv2-ws-queue-operational-record__header-subline--in-attention');
        expect(html).toMatch(
            /data-testid="queue-header-attention-column"[\s\S]*data-testid="queue-header-attention-inline"[\s\S]*data-testid="queue-header-enrollment-subline"/
        );
        expect(html).toContain('data-queue-header-subline-readable="true"');
        expect(html).toContain("Commitment date missed");
        expect(html).toContain("Next step: Call family within one business day to confirm interest.");
        expect(html).not.toContain("Next stepCall");
        expect(html).not.toMatch(/Urgent:[^<]*…/);
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
        expect(html).toMatch(
            /data-testid="queue-header-attention-column"[\s\S]*data-testid="queue-header-waitlist-reason"/
        );
        expect(html).toContain("Sibling priority");
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
        expect(html).toContain("#1 Standard family");
        expect(html).toContain("Sibling also waitlisted: Riley Williams — Toddler");
        expect(html).toContain('data-testid="queue-header-waitlist-reason"');
        expect(html).toContain('data-testid="queue-header-waitlist-ops"');
        expect(html).toContain("Adjust position");
        expect(html).toContain('data-testid="queue-header-waitlist-since"');
        expect(html).toContain("Waitlisted since 06/15/2024");
        expect(html).toContain("Desired start: Apr 2026");
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
        expect(html).toContain('data-testid="queue-parent-contact-meta"');
        expect(html).toContain("adminv2-ws-queue-operational-record__parent-identity--inline");
        expect(html).toContain("adminv2-ws-queue-operational-record__parent-sep");
        expect(html).toMatch(/Kevin Mitchell[\s\S]*\(503\) 555-4729/);
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
        expect(html).toContain('data-queue-header-layout="attention-column"');
        expect(html).not.toContain('data-queue-attention-supplement="true"');
    });
});
