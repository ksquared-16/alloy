import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type {
    OperationalContext,
    OperationalContextSignals,
} from "@/lib/adminV2/runtime/operationalContext/types";

const EMPTY_SIGNALS: OperationalContextSignals = {
    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null },
};

function ctx(truth: Record<string, unknown>): OperationalContext {
    return {
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
                        desired_start_date: "2025-08-26",
                    },
                ],
            }),
        );
        expect(evidence.count).toBe(1);
        const emma = evidence.children[0]!;
        expect(emma.name).toBe("Emma Johnson");
        expect(emma.dobAge).toBe("Mar 3, 2020 · 6y");
        expect(emma.program).toBe("Preschool");
        expect(emma.room).toBe("Sunflower");
        expect(emma.schedule).toBe("M–F · Full day");
        expect(emma.status).toBe("Enrolled");
        expect(emma.statusTone).toBe("positive");
        expect(emma.startDate).toBe("2025-08-26");
        expect(emma.needsAttention).toBe(false);
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
                    { id: "c1", display_name: "Emma", outcome_status_key: "enrolled", outcome_status_label: "Enrolled", desired_program_label: "Preschool", desired_schedule_label: "Full day", desired_start_date: "2025-08-26" },
                    { id: "c2", display_name: "Liam", outcome_status_key: "enrolled", outcome_status_label: "Enrolled", desired_program_label: "Toddler", desired_schedule_label: "Half day", desired_start_date: "2025-08-26" },
                    { id: "c3", display_name: "Noah", outcome_status_key: "waitlisted", outcome_status_label: "Waitlisted" },
                ],
            }),
        );
        expect(evidence.count).toBe(3);
        expect(evidence.answerLine).toBe("3 children · 2 enrolled, 1 waitlisted");
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
