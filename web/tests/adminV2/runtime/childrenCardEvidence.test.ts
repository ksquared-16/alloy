import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import { formatFocusPanelDobAgeLine } from "@/lib/adminV2/runtime/focusPanel/focusPanelDateDisplay";
import type {
    OperationalContext,
    OperationalContextSignals,
} from "@/lib/adminV2/runtime/operationalContext/types";

const EMPTY_SIGNALS: OperationalContextSignals = {
    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
    communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
    billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
};

function ctx(truth: Record<string, unknown>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Johnson Household" },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth,
        signals: EMPTY_SIGNALS,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

describe("buildChildrenCardEvidence", () => {
    it("returns empty when no children are linked", () => {
        const evidence = buildChildrenCardEvidence(ctx({ id: "opp-1", _inquiry_children: [] }));
        expect(evidence.count).toBe(0);
        expect(evidence.answerLine).toBe("No children on this record");
        expect(evidence.supportingLine).toBe("Add a child to begin");
    });

    it("derives operational truth (program/room/schedule/status/start) from context.truth", () => {
        const evidence = buildChildrenCardEvidence(
            ctx({
                id: "opp-1",
                _inquiry_children: [
                    {
                        id: "c1",
                        display_name: "Emma Johnson",
                        dob: "2020-03-03",
                        age: "6y",
                        desired_program_label: "Preschool",
                        program_room_cohort_label: "Sunflower",
                        desired_schedule_label: "M–F · Full day",
                        outcome_status_key: "enrolled",
                        outcome_status_label: "Enrolled",
                        start_date: "2025-08-26",
                    },
                ],
            }),
        );
        expect(evidence.count).toBe(1);
        const emma = evidence.children[0]!;
        expect(emma.name).toBe("Emma Johnson");
        expect(emma.dobAge).toBe(formatFocusPanelDobAgeLine("2020-03-03", "6y"));
        expect(emma.program).toBe("Preschool");
        expect(emma.room).toBe("Sunflower");
        expect(emma.schedule).toBe("M–F · Full day");
        expect(emma.status).toBe("Enrolled");
        expect(emma.statusTone).toBe("positive");
        expect(emma.startDate).toBe("Aug 26, 2025");
        expect(emma.needsAttention).toBe(false);
        // Answer-first sentence evidence (no labeled field grid).
        expect(emma.detailLine).toBe("Preschool · Sunflower · M–F · Full day · starts Aug 26, 2025");
        expect(emma.missingLine).toBeNull();
        expect(evidence.enrolledCount).toBe(1);
    });

    it("flags a child missing program / schedule / start as needing attention", () => {
        const evidence = buildChildrenCardEvidence(
            ctx({
                id: "opp-1",
                _inquiry_children: [
                    { id: "c1", display_name: "Noah Johnson", outcome_status_key: "waitlisted", outcome_status_label: "Waitlisted" },
                ],
            }),
        );
        const noah = evidence.children[0]!;
        expect(noah.needsAttention).toBe(true);
        // "What's still needed" diagnosis sentence for an attention child.
        expect(noah.missingLine).toBe("Needs program, schedule & start date");
        expect(noah.detailLine).toBeNull();
        expect(noah.statusTone).toBe("work");
        expect(evidence.waitlistedCount).toBe(1);
        expect(evidence.attentionCount).toBe(1);
        expect(evidence.hasAttention).toBe(true);
        expect(evidence.supportingLine).toContain("Noah");
    });

    it("summarizes mixed enrollment statuses in the answer line", () => {
        const evidence = buildChildrenCardEvidence(
            ctx({
                id: "opp-1",
                _inquiry_children: [
                    { id: "c1", display_name: "Emma", outcome_status_key: "enrolled", outcome_status_label: "Enrolled", desired_program_label: "Preschool", desired_schedule_label: "Full day", start_date: "2025-08-26" },
                    { id: "c2", display_name: "Liam", outcome_status_key: "enrolled", outcome_status_label: "Enrolled", desired_program_label: "Toddler", desired_schedule_label: "Half day", start_date: "2025-08-26" },
                    { id: "c3", display_name: "Noah", outcome_status_key: "waitlisted", outcome_status_label: "Waitlisted" },
                ],
            }),
        );
        expect(evidence.count).toBe(3);
        expect(evidence.answerLine).toBe("3 children · 2 enrolled, 1 waitlisted");
    });

    it("humanizes an unlabeled status key instead of showing the raw key", () => {
        // Org missing a status_definitions label for this key on opportunity_customer_members.
        const evidence = buildChildrenCardEvidence(
            ctx({
                id: "opp-1",
                _inquiry_children: [{ id: "c1", display_name: "Ada Lovelace", outcome_status_key: "custom_hold" }],
            }),
        );
        const ada = evidence.children[0]!;
        expect(ada.status).toBe("Custom Hold");
        expect(ada.status).not.toBe("custom_hold");
    });

    it("suppresses the child status badge for a brand-new lead (no enrollment outcome)", () => {
        const evidence = buildChildrenCardEvidence(
            ctx({ id: "opp-1", _inquiry_children: [{ id: "c1", display_name: "Ada", outcome_status_key: null }] }),
        );
        expect(evidence.children[0]!.status).toBeNull();
    });

    it("renders a legacy new_inquiry child row as 'New Lead', never 'New Inquiry'", () => {
        const evidence = buildChildrenCardEvidence(
            ctx({ id: "opp-1", _inquiry_children: [{ id: "c1", display_name: "Ada", outcome_status_key: "new_inquiry" }] }),
        );
        expect(evidence.children[0]!.status).toBe("New Lead");
        expect(evidence.children[0]!.status).not.toBe("New Inquiry");
    });

    it("shows the child's PROCESS STAGE, not the retired participation status label", () => {
        const evidence = buildChildrenCardEvidence(
            ctx({
                id: "opp-1",
                _inquiry_children: [
                    {
                        id: "c1",
                        display_name: "Ada Lovelace",
                        // Even with a configured disposition label, the operator sees the Process Stage.
                        outcome_status_key: "new_inquiry",
                        outcome_status_label: "Inquiry Received",
                    },
                    { id: "c2", display_name: "Grace Hopper", outcome_status_key: "waitlisted" },
                    { id: "c3", display_name: "Kay Antonelli", outcome_status_key: "enrolled" },
                ],
            }),
        );
        expect(evidence.children[0]!.status).toBe("New Lead"); // new_inquiry → Lead stage, not "Inquiry Received"
        expect(evidence.children[1]!.status).toBe("Waitlist"); // disposition → Process Stage
        expect(evidence.children[2]!.status).toBe("Enrolled");
    });

    it("never surfaces a UUID-like status id as operator copy", () => {
        const evidence = buildChildrenCardEvidence(
            ctx({
                id: "opp-1",
                _inquiry_children: [
                    { id: "c1", display_name: "Ada Lovelace", outcome_status_key: "11111111-1111-4111-8111-111111111111" },
                ],
            }),
        );
        expect(evidence.children[0]!.status).toBeNull();
    });

    it("reads gender from raw inquiry child profile (drawer mapping strips it)", () => {
        const evidence = buildChildrenCardEvidence(
            ctx({
                id: "opp-1",
                _inquiry_children: [
                    {
                        id: "c1",
                        customer_member_id: "cm-1",
                        display_name: "Blake Wenc",
                        first_name: "Blake",
                        last_name: "Wenc",
                        gender: "male",
                    },
                ],
            }),
        );
        expect(evidence.children[0]!.gender).toBe("Male");
    });

    it("does NOT import drawer VM types — it observes the Operational Context", () => {
        const source = readFileSync(
            path.join(process.cwd(), "lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence.ts"),
            "utf8",
        );
        expect(source).toContain("OperationalContext");
        expect(source).not.toMatch(/OpportunityDrawerViewModel|displayVm|drawerId|DrawerTabKey/);
    });
});
