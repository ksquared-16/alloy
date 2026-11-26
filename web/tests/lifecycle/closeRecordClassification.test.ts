/**
 * Close-record classification — status-only updates are close_record only when the
 * target status resolves as terminal/closed for the correct status domain.
 */
import { describe, expect, it } from "vitest";

import { classifyOutcomeAutomationKind } from "@/lib/lifecycle/stageOutcomeAutomation";
import {
    isClosedStatusKeyForEntity,
    isConfiguredClosedStatus,
    type OutcomeStatusConfiguredRow,
} from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import {
    stageOperatingContractHasBlockingErrors,
    validateStageOperatingPlanOperatingContract,
} from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const LEAD_STATUSES: OutcomeStatusConfiguredRow[] = [
    { status_key: "open", status_label: "Open", entity_type: "opportunities" },
    {
        status_key: "closed",
        status_label: "Closed",
        entity_type: "opportunities",
        metadata: { terminal: true },
    },
    {
        status_key: "lost",
        status_label: "Lost",
        entity_type: "opportunities",
        is_closed: true,
    },
];

const CHILD_STATUSES: OutcomeStatusConfiguredRow[] = [
    { status_key: "open", status_label: "Open", entity_type: "opportunity_customer_members" },
    {
        status_key: "withdrawn",
        status_label: "Withdrawn",
        entity_type: "opportunity_customer_members",
        metadata: { terminal: true },
    },
    {
        status_key: "not_enrolling",
        status_label: "Not enrolling",
        entity_type: "opportunity_customer_members",
        is_closed: true,
    },
];

function basePlan(overrides?: Partial<StageOperatingPlanV1>): StageOperatingPlanV1 {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: "lead",
        journey_segment: "family",
        work_templates: [],
        outcomes: [{ outcome_key: "mark_open", label: "Mark open" }],
        outcome_rules: [
            {
                rule_key: "mark_open_status",
                when_outcome_key: "mark_open",
                targets: [{ kind: "update_family_case_status", status_key: "open" }],
            },
        ],
        attention_rules: [],
        ...overrides,
    };
}

describe("close_record classification", () => {
    it("status=open without stage movement is not close_record", () => {
        expect(
            classifyOutcomeAutomationKind(
                [{ kind: "update_family_case_status", status_key: "open" }],
                { configuredStatuses: LEAD_STATUSES, entityType: "opportunities" },
            ),
        ).toBe("stay_in_stage");
    });

    it("terminal lead status is close_record", () => {
        expect(
            classifyOutcomeAutomationKind(
                [{ kind: "update_family_case_status", status_key: "closed" }],
                { configuredStatuses: LEAD_STATUSES, entityType: "opportunities" },
            ),
        ).toBe("close_record");
        expect(
            classifyOutcomeAutomationKind(
                [{ kind: "update_family_case_status", status_key: "lost" }],
                { configuredStatuses: LEAD_STATUSES, entityType: "opportunities" },
            ),
        ).toBe("close_record");
    });

    it("child enrollment closed status resolves only in the child domain", () => {
        expect(
            isClosedStatusKeyForEntity({
                statusKey: "withdrawn",
                entityType: "opportunity_customer_members",
                configuredStatuses: CHILD_STATUSES,
            }),
        ).toBe(true);
        // Same key is not a lead/case closed status unless catalogued there.
        expect(
            isClosedStatusKeyForEntity({
                statusKey: "withdrawn",
                entityType: "opportunities",
                configuredStatuses: LEAD_STATUSES,
            }),
        ).toBe(false);
        expect(
            classifyOutcomeAutomationKind(
                [{ kind: "update_child_enrollment_status", status_key: "withdrawn" }],
                { configuredStatuses: CHILD_STATUSES, entityType: "opportunity_customer_members" },
            ),
        ).toBe("close_record");
        expect(
            classifyOutcomeAutomationKind(
                [{ kind: "update_child_enrollment_status", status_key: "open" }],
                { configuredStatuses: CHILD_STATUSES, entityType: "opportunity_customer_members" },
            ),
        ).toBe("stay_in_stage");
    });

    it("true close without closed-status configuration produces actionable non-blocking validation", () => {
        const plan = basePlan({
            outcomes: [{ outcome_key: "lost", label: "Lost" }],
            outcome_rules: [
                {
                    rule_key: "lost_close",
                    when_outcome_key: "lost",
                    targets: [{ kind: "update_family_case_status", status_key: "closed" }],
                },
            ],
        });
        // Key heuristic still classifies "closed" as close_record even with empty catalog.
        expect(
            classifyOutcomeAutomationKind(
                [{ kind: "update_family_case_status", status_key: "closed" }],
                { configuredStatuses: [], entityType: "opportunities" },
            ),
        ).toBe("close_record");

        const issues = validateStageOperatingPlanOperatingContract({
            plan,
            configuredStatuses: [],
            entityType: "opportunities",
        });
        const missing = issues.find((i) => i.code === "outcome_close_status_missing");
        expect(missing).toBeTruthy();
        expect(missing?.severity).toBe("warning");
        expect(missing?.message).toMatch(/Outcome "lost"/);
        expect(missing?.message).toMatch(/stage "lead"/);
        expect(missing?.message).toMatch(/lead status/);
        expect(missing?.message).toMatch(/Organization → Statuses/);
        expect(stageOperatingContractHasBlockingErrors(issues)).toBe(false);
    });

    it("ordinary non-close stages no longer receive the closed-status error", () => {
        const plan = basePlan();
        const issues = validateStageOperatingPlanOperatingContract({
            plan,
            configuredStatuses: LEAD_STATUSES,
            entityType: "opportunities",
        });
        expect(issues.some((i) => i.code === "outcome_close_status_missing")).toBe(false);
        expect(issues.some((i) => i.code === "outcome_close_status_invalid")).toBe(false);
        expect(stageOperatingContractHasBlockingErrors(issues)).toBe(false);
    });

    it("isConfiguredClosedStatus remains the single closed-signal authority", () => {
        expect(isConfiguredClosedStatus(LEAD_STATUSES[1]!)).toBe(true);
        expect(isConfiguredClosedStatus(LEAD_STATUSES[0]!)).toBe(false);
        expect(isConfiguredClosedStatus(CHILD_STATUSES[1]!)).toBe(true);
    });
});
