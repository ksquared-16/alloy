import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildReadinessCardEvidence } from "@/lib/adminV2/runtime/focusPanel/readiness/buildReadinessCardEvidence";
import type {
    OperationalContext,
    OperationalContextSignals,
} from "@/lib/adminV2/runtime/operationalContext/types";

function signals(attention?: Partial<OperationalContextSignals["attention"]>): OperationalContextSignals {
    return {
        work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
        attention: { needsAttention: false, primaryReason: null, reasonCount: 0, ...attention },
        tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
        communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
        billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
    };
}

function ctx(
    truth: Record<string, unknown>,
    attention?: Partial<OperationalContextSignals["attention"]>,
): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Johnson Household" },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth,
        signals: signals(attention),
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

function child(extra: Record<string, unknown>): Record<string, unknown> {
    return { id: "c1", display_name: "Emma", ...extra };
}

describe("buildReadinessCardEvidence", () => {
    it("is unknown when nothing has been established", () => {
        const evidence = buildReadinessCardEvidence(ctx({ id: "opp-1", _inquiry_children: [] }));
        expect(evidence.isEmpty).toBe(true);
        expect(evidence.verdict).toBe("unknown");
        expect(evidence.score).toBeNull();
        expect(evidence.answerLine).toBe("Not enough info to assess");
    });

    it("computes an honest completion score from real factors", () => {
        const evidence = buildReadinessCardEvidence(
            ctx({
                id: "opp-1",
                "person.primary_contact_name": "Sarah Johnson",
                _inquiry_children: [
                    child({
                        desired_program_label: "Preschool",
                        desired_schedule_label: "Full day",
                        start_date: "2025-08-26",
                    }),
                ],
            }),
        );
        // All 5 factors complete → ready, 100%.
        expect(evidence.verdict).toBe("ready");
        expect(evidence.score).toBe(100);
        expect(evidence.completeCount).toBe(evidence.totalCount);
    });

    it("is 'almost' with partial completion and lists incomplete factors as blockers", () => {
        const evidence = buildReadinessCardEvidence(
            ctx({
                id: "opp-1",
                "person.primary_contact_name": "Sarah Johnson",
                _inquiry_children: [child({ desired_program_label: "Preschool" })],
            }),
        );
        expect(evidence.verdict).toBe("almost");
        expect(evidence.score).toBeGreaterThan(0);
        expect(evidence.score).toBeLessThan(100);
        expect(evidence.blockers).toContain("Schedule selected");
        expect(evidence.blockers).toContain("Desired start");
        // Diagnosis copy leads with WHAT is missing (nouns), not a percentage.
        expect(evidence.answerLine).toContain("needed");
        expect(evidence.answerLine.toLowerCase()).toContain("schedule");
        expect(evidence.answerLine).not.toMatch(/^\d+% ready/);
    });

    it("points each incomplete factor at its owner card (Readiness references, never edits)", () => {
        const evidence = buildReadinessCardEvidence(
            ctx({
                id: "opp-1",
                _inquiry_children: [child({ id: "c1" })],
            }),
        );
        const primary = evidence.factors.find((f) => f.key === "primary_contact");
        expect(primary?.ownerCard).toBe("household");
        expect(primary?.ownerFocus).toBe("primary_contact");

        const program = evidence.factors.find((f) => f.key === "program");
        expect(program?.ownerCard).toBe("children");
        // Points at the specific child still missing the program.
        expect(program?.ownerFocus).toBe("c1");
    });

    it("is blocked when a real attention blocker is present (diagnosis framing)", () => {
        const evidence = buildReadinessCardEvidence(
            ctx(
                {
                    id: "opp-1",
                    "person.primary_contact_name": "Sarah Johnson",
                    _inquiry_children: [
                        child({ desired_program_label: "Preschool", desired_schedule_label: "Full day", start_date: "2025-08-26" }),
                    ],
                },
                { needsAttention: true, primaryReason: "Immunization record missing", reasonCount: 1 },
            ),
        );
        expect(evidence.verdict).toBe("blocked");
        expect(evidence.answerLine).toBe("Blocked — Immunization record missing");
        expect(evidence.statusTone).toBe("blocked");
        // Attention has no Core-Four owner — informational only, no handoff target.
        const attention = evidence.factors.find((f) => f.key === "attention");
        expect(attention?.ownerCard).toBeNull();
    });

    it("derives entirely from the Operational Context — no drawer VM", () => {
        const source = readFileSync(
            path.join(process.cwd(), "lib/adminV2/runtime/focusPanel/readiness/buildReadinessCardEvidence.ts"),
            "utf8",
        );
        expect(source).toContain("OperationalContext");
        expect(source).not.toMatch(/OpportunityDrawerViewModel|displayVm|drawerId|DrawerTabKey/);
    });
});
