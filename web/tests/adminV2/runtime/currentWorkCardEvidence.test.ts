import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildCurrentWorkCardEvidence } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence";
import type {
    OperationalContext,
    OperationalContextSignals,
    OperationalWorkItem,
} from "@/lib/adminV2/runtime/operationalContext/types";

function workItem(partial: Partial<OperationalWorkItem>): OperationalWorkItem {
    return {
        id: "t1",
        label: "Confirm tour booking",
        state: "open",
        dueLabel: "Due today",
        dueAt: "2026-06-27",
        urgency: "today",
        source: "BOS Assist",
        kind: "task",
        ...partial,
    };
}

function ctx(work: Partial<OperationalContextSignals["work"]>): OperationalContext {
    const signals: OperationalContextSignals = {
        work: {
            primary: null,
            items: [],
            openCount: 0,
            overdueCount: 0,
            nextActionLabel: null,
            ...work,
        },
        attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
        tour: { scheduled: false, startAt: null, statusLabel: null, bookingId: null },
        communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
        billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
    };
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Johnson Household" },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth: { id: "opp-1" },
        signals,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

describe("buildCurrentWorkCardEvidence", () => {
    it("returns empty when there are no work items", () => {
        const evidence = buildCurrentWorkCardEvidence(ctx({}));
        expect(evidence.isEmpty).toBe(true);
        expect(evidence.answerLine).toBe("No open work");
        expect(evidence.statusChip).toBe("Clear");
        expect(evidence.statusTone).toBe("ready");
    });

    it("surfaces a next action when no tasks but an action is configured", () => {
        const evidence = buildCurrentWorkCardEvidence(ctx({ nextActionLabel: "Advance to enrolled" }));
        expect(evidence.isEmpty).toBe(true);
        expect(evidence.answerLine).toBe("Advance to enrolled");
    });

    it("answers with the most-urgent item and an open-count chip", () => {
        const primary = workItem({});
        const evidence = buildCurrentWorkCardEvidence(
            ctx({
                primary,
                items: [primary, workItem({ id: "t2", label: "Send packet", urgency: "upcoming", dueLabel: "Due Jun 30" })],
                openCount: 2,
            }),
        );
        expect(evidence.isEmpty).toBe(false);
        expect(evidence.answerLine).toBe("Confirm tour booking");
        expect(evidence.supportingLine).toBe("Due today · 2 open tasks");
        expect(evidence.statusChip).toBe("2 open");
        expect(evidence.statusTone).toBe("due");
    });

    it("escalates to blocked tone when work is overdue", () => {
        const overdue = workItem({ urgency: "overdue", dueLabel: "Overdue 2 days" });
        const evidence = buildCurrentWorkCardEvidence(
            ctx({ primary: overdue, items: [overdue], openCount: 1, overdueCount: 1 }),
        );
        expect(evidence.hasOverdue).toBe(true);
        expect(evidence.statusTone).toBe("blocked");
        expect(evidence.statusChip).toBe("Overdue");
    });

    it("observes the Operational Context (signals.work), not the drawer VM", () => {
        const source = readFileSync(
            path.join(process.cwd(), "lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence.ts"),
            "utf8",
        );
        expect(source).toContain("context.signals.work");
        expect(source).not.toMatch(/OpportunityDrawerViewModel|displayVm|drawerId|DrawerTabKey/);
    });
});
