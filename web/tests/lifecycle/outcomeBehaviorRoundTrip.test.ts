/**
 * Editing one outcome must not silently delete another part of its configuration.
 *
 * `upsertComposableOutcomeBehavior` rebuilds an outcome's rules from the editable draft. That draft
 * modelled 3 of the 10 `StageOutcomeRuleTargetKind`s, so every other kind was deleted the moment an
 * operator touched any control — including the `update_family_case_status: closed` that IS Closed
 * Lost, and the `when_attempt_count_*` branches that make Unable To Reach escalate. The generated
 * summary reads the rules directly, so it kept describing the configuration correctly right up
 * until save: the loss was invisible in the product.
 *
 * Every fixture below is Firefly's live Lead draft, verbatim.
 */

import { describe, expect, it } from "vitest";

import {
    readComposableOutcomeBehaviorDraft,
    upsertComposableOutcomeBehavior,
} from "@/lib/lifecycle/stageOutcomeAutomation";
import type { StageOutcomeRuleV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const FIREFLY_LEAD_RULES: StageOutcomeRuleV1[] = [
    {
        rule_key: "reached_move",
        when_outcome_key: "reached_qualified",
        targets: [
            { kind: "update_family_case_status", status_key: "open" },
            { kind: "mark_stage_work_complete" },
        ],
    },
    {
        rule_key: "left_message_repeat",
        when_outcome_key: "left_message",
        targets: [{ kind: "reopen_work", template_key: "contact_family", due_days: 2 }],
    },
    {
        rule_key: "awaiting_attention",
        when_outcome_key: "awaiting_response",
        targets: [
            { kind: "no_movement" },
            {
                kind: "create_needs_attention",
                attention_reason: "Awaiting family response",
                wait_bucket: "waiting_on_family",
            },
        ],
    },
    {
        rule_key: "unable_repeat",
        when_outcome_key: "unable_to_reach",
        targets: [{ kind: "reopen_work", template_key: "contact_family", due_days: 2 }],
        when_attempt_count_lt: 3,
    },
    {
        rule_key: "unable_attention",
        when_outcome_key: "unable_to_reach",
        targets: [
            {
                kind: "create_needs_attention",
                attention_reason: "Unable to reach after 3 attempts",
                wait_bucket: "waiting_on_staff",
            },
        ],
        when_attempt_count_gte: 3,
    },
    {
        rule_key: "contact_closed_lost",
        when_outcome_key: "contact_closed_lost",
        targets: [
            { kind: "update_family_case_status", status_key: "closed" },
            { kind: "mark_stage_work_complete" },
        ],
    },
    {
        rule_key: "tour_scheduled_to_tour",
        when_outcome_key: "tour_scheduled",
        targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
    },
    {
        rule_key: "domain_tour_booking_scheduled_to_tour",
        when_domain_signal: { domain: "tour_booking", signal: "scheduled" },
        targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
    },
];

/** Read then immediately write back, which is what an incidental UI touch does. */
function touch(outcomeKey: string, rules: StageOutcomeRuleV1[]): StageOutcomeRuleV1[] {
    return upsertComposableOutcomeBehavior(
        rules,
        outcomeKey,
        readComposableOutcomeBehaviorDraft(outcomeKey, rules),
    );
}

function targetsFor(rules: StageOutcomeRuleV1[], outcomeKey: string) {
    return rules.filter((r) => r.when_outcome_key === outcomeKey).flatMap((r) => r.targets);
}

describe("an incidental edit preserves what it cannot express", () => {
    it("Closed Lost keeps closing the case", () => {
        // The regression in one assertion: this used to collapse to [{kind:'no_movement'}].
        const after = touch("contact_closed_lost", FIREFLY_LEAD_RULES);
        const targets = targetsFor(after, "contact_closed_lost");
        expect(targets).toContainEqual({ kind: "update_family_case_status", status_key: "closed" });
        expect(targets).toContainEqual({ kind: "mark_stage_work_complete" });
    });

    it("Reached / Qualified keeps its open status and work completion", () => {
        const targets = targetsFor(touch("reached_qualified", FIREFLY_LEAD_RULES), "reached_qualified");
        expect(targets).toContainEqual({ kind: "update_family_case_status", status_key: "open" });
        expect(targets).toContainEqual({ kind: "mark_stage_work_complete" });
    });

    it("Left Message keeps reopen_work, a kind the editor cannot show", () => {
        const targets = targetsFor(touch("left_message", FIREFLY_LEAD_RULES), "left_message");
        expect(targets).toContainEqual({
            kind: "reopen_work",
            template_key: "contact_family",
            due_days: 2,
        });
    });

    it("Unable To Reach keeps BOTH attempt-count branches", () => {
        const after = touch("unable_to_reach", FIREFLY_LEAD_RULES);
        const rules = after.filter((r) => r.when_outcome_key === "unable_to_reach");
        expect(rules.some((r) => r.when_attempt_count_lt === 3)).toBe(true);
        expect(rules.some((r) => r.when_attempt_count_gte === 3)).toBe(true);
        // ...and does not invent an unconditional rule for an outcome that never had one.
        expect(rules.every((r) => !isUnconditional(r))).toBe(true);
    });

    it("Tour Scheduled keeps its movement and rule identity", () => {
        const after = touch("tour_scheduled", FIREFLY_LEAD_RULES);
        const rule = after.find((r) => r.when_outcome_key === "tour_scheduled")!;
        expect(rule.rule_key).toBe("tour_scheduled_to_tour");
        expect(rule.targets).toContainEqual({ kind: "move_to_stage", transition_ref: "lead_to_tour" });
    });

    it("never disturbs the booking domain-signal rule", () => {
        for (const key of ["contact_closed_lost", "tour_scheduled", "left_message"]) {
            const after = touch(key, FIREFLY_LEAD_RULES);
            expect(
                after.find((r) => r.rule_key === "domain_tour_booking_scheduled_to_tour"),
                `${key} edit dropped the booking signal`,
            ).toEqual(FIREFLY_LEAD_RULES[7]);
        }
    });

    it("leaves every other outcome untouched", () => {
        const after = touch("contact_closed_lost", FIREFLY_LEAD_RULES);
        for (const key of ["reached_qualified", "left_message", "awaiting_response", "unable_to_reach"]) {
            expect(
                after.filter((r) => r.when_outcome_key === key),
                key,
            ).toEqual(FIREFLY_LEAD_RULES.filter((r) => r.when_outcome_key === key));
        }
    });
});

function isUnconditional(rule: StageOutcomeRuleV1): boolean {
    return (
        rule.when_attempt_count_lt == null &&
        rule.when_attempt_count_gte == null &&
        !rule.when_domain_signal &&
        !rule.when_enter_status_key
    );
}

describe("the close semantics the editor now owns", () => {
    it("writes status and close reason together", () => {
        const draft = readComposableOutcomeBehaviorDraft("contact_closed_lost", FIREFLY_LEAD_RULES);
        const after = upsertComposableOutcomeBehavior(FIREFLY_LEAD_RULES, "contact_closed_lost", {
            ...draft,
            case_status: { status_key: "closed", close_reason_key: "lost" },
        });
        expect(targetsFor(after, "contact_closed_lost")).toContainEqual({
            kind: "update_family_case_status",
            status_key: "closed",
            close_reason_key: "lost",
        });
    });

    it("reads a close reason back out", () => {
        const withReason: StageOutcomeRuleV1[] = [
            {
                rule_key: "contact_closed_lost",
                when_outcome_key: "contact_closed_lost",
                targets: [
                    { kind: "update_family_case_status", status_key: "closed", close_reason_key: "lost" },
                ],
            },
        ];
        const draft = readComposableOutcomeBehaviorDraft("contact_closed_lost", withReason);
        expect(draft.case_status).toEqual({ status_key: "closed", close_reason_key: "lost" });
    });

    it("can carry a close and a stage move at once", () => {
        const draft = readComposableOutcomeBehaviorDraft("contact_closed_lost", FIREFLY_LEAD_RULES);
        const after = upsertComposableOutcomeBehavior(FIREFLY_LEAD_RULES, "contact_closed_lost", {
            ...draft,
            case_status: { status_key: "closed", close_reason_key: "lost" },
            movement: "move_through_transition",
            transition_ref: "lead_to_closed",
        });
        const targets = targetsFor(after, "contact_closed_lost");
        expect(targets).toContainEqual({ kind: "move_to_stage", transition_ref: "lead_to_closed" });
        expect(targets).toContainEqual({
            kind: "update_family_case_status",
            status_key: "closed",
            close_reason_key: "lost",
        });
        expect(targets).toContainEqual({ kind: "mark_stage_work_complete" });
    });

    it("clearing the case status actually clears it", () => {
        const draft = readComposableOutcomeBehaviorDraft("contact_closed_lost", FIREFLY_LEAD_RULES);
        const after = upsertComposableOutcomeBehavior(FIREFLY_LEAD_RULES, "contact_closed_lost", {
            ...draft,
            case_status: undefined,
        });
        expect(
            targetsFor(after, "contact_closed_lost").some((t) => t.kind === "update_family_case_status"),
        ).toBe(false);
    });
});
