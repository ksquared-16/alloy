import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildCurrentWorkCardEvidence } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
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

function ctx(
    work: Partial<OperationalContextSignals["work"]>,
    runtime?: StageWorkRuntimeProjection | null,
): OperationalContext {
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
        tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
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
        stageWorkRuntime: runtime ?? null,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

describe("buildCurrentWorkCardEvidence", () => {
    it("returns empty when stage work is not configured", () => {
        const evidence = buildCurrentWorkCardEvidence(ctx({}));
        expect(evidence.isEmpty).toBe(true);
        expect(evidence.answerLine).toBe("No current work configured");
        expect(evidence.statusChip).toBeNull();
        expect(evidence.statusTone).toBe("neutral");
    });

    it("does not synthesize work from signals.work when stage runtime is absent", () => {
        const evidence = buildCurrentWorkCardEvidence(
            ctx({ nextActionLabel: "Advance to enrolled", openCount: 2, primary: workItem({}) }),
        );
        expect(evidence.isEmpty).toBe(true);
        expect(evidence.answerLine).toBe("No current work configured");
    });

    it("answers from configured stage work, not signals.work items", () => {
        const runtime: StageWorkRuntimeProjection = {
            stage_key: "tour",
            stage_label: "Tour",
            purpose: "Confirm tour booking",
            journey_segment: "family",
            template_keys: ["confirm_tour"],
            primary: {
                template_key: "confirm_tour",
                label: "Confirm tour booking",
                role: "primary",
                state: "open",
                requires_outcome_picker: false,
                work_id: "w1",
                due_at: null,
                due_urgency: "due_today",
                attempt_count: 0,
                last_outcome: null,
                completed_at: null,
                outcomes: [],
                completion_policy_summary: null,
                completion_policy_min_attempts: null,
                completion_policy_max_attempts: null,
                outcome_automation_preview: [],
            },
            additional: [
                {
                    template_key: "send_packet",
                    label: "Send packet",
                    role: "secondary",
                    state: "open",
                    requires_outcome_picker: false,
                    work_id: "w2",
                    due_at: null,
                    due_urgency: "none",
                    attempt_count: 0,
                    last_outcome: null,
                    completed_at: null,
                    outcomes: [],
                    completion_policy_summary: null,
                    completion_policy_min_attempts: null,
                    completion_policy_max_attempts: null,
                    outcome_automation_preview: [],
                },
            ],
            execution: {
                department_id: "dept-1",
                subject: { journey_segment: "family", opportunity_id: "opp-1" },
                requires_outcome_picker: false,
            },
        };
        const evidence = buildCurrentWorkCardEvidence(ctx({ openCount: 2, overdueCount: 0 }, runtime));
        expect(evidence.isEmpty).toBe(false);
        expect(evidence.answerLine).toBe("Confirm tour booking");
        expect(evidence.supportingLine).toContain("Confirm tour booking");
        expect(evidence.statusChip).toBe("0 of 2 complete");
    });

    it("escalates to blocked tone when work signals report overdue", () => {
        const runtime: StageWorkRuntimeProjection = {
            stage_key: "tour",
            stage_label: "Tour",
            purpose: null,
            journey_segment: "family",
            template_keys: ["confirm_tour"],
            primary: {
                template_key: "confirm_tour",
                label: "Confirm tour booking",
                role: "primary",
                state: "open",
                requires_outcome_picker: false,
                work_id: "w1",
                due_at: null,
                due_urgency: "overdue",
                attempt_count: 0,
                last_outcome: null,
                completed_at: null,
                outcomes: [],
                completion_policy_summary: null,
                completion_policy_min_attempts: null,
                completion_policy_max_attempts: null,
                outcome_automation_preview: [],
            },
            additional: [],
            execution: {
                department_id: "dept-1",
                subject: { journey_segment: "family", opportunity_id: "opp-1" },
                requires_outcome_picker: false,
            },
        };
        const evidence = buildCurrentWorkCardEvidence(
            ctx({ openCount: 1, overdueCount: 1 }, runtime),
        );
        expect(evidence.hasOverdue).toBe(true);
        expect(evidence.statusTone).toBe("blocked");
        expect(evidence.statusChip).toBe("Overdue");
    });

    it("observes stage work runtime via projectCurrentWork, not the drawer VM", () => {
        const source = readFileSync(
            path.join(process.cwd(), "lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence.ts"),
            "utf8",
        );
        expect(source).toContain("projectCurrentWork(context)");
        expect(source).not.toMatch(/OpportunityDrawerViewModel|displayVm|drawerId|DrawerTabKey/);
    });
});
