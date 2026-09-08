import { describe, expect, it } from "vitest";

import {
    childStageDestinationOperability,
    familyStageDestinationOperability,
} from "@/lib/runtime/provisioning/workViewDestinationOperability";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

/**
 * A DESTINATION IS OPERABLE WHEN ITS OWN EXECUTION MODE SAYS IT IS.
 *
 * `resolveWorkTemplateExecutionMode` states the contract: `direct_action` carries an executable
 * Primary Action; `outcome_led` "intentionally has no Primary Action; Record Outcome leads". This
 * rule predated the mode and read a missing action as unreachability, so a stage that had
 * deliberately declared itself outcome-led was called inoperable — and one inoperable stage refuses
 * the WHOLE Work View. The representative certification tenant configures `tour` and `decision`
 * exactly that way, and the result was a process with no queues, no rows and no selectable subject.
 *
 * These cases pin all three sides so the fix cannot drift into a blanket relaxation.
 */
function stage(over: {
    key?: string;
    execution_mode?: "direct_action" | "outcome_led" | string;
    actionRef?: string | null;
    templates?: unknown[] | null;
    primary?: boolean;
}): LifecycleBuilderStageRecord {
    const template: Record<string, unknown> = {
        template_key: "t1",
        label: "Work",
        primary: over.primary ?? true,
    };
    if (over.execution_mode !== undefined) template.execution_mode = over.execution_mode;
    if (over.actionRef) template.primary_action = { action_ref: over.actionRef };
    return {
        key: over.key ?? "tour",
        grain: "family",
        stage_operating_plan_v1: {
            version: 1,
            journey_segment: "family",
            work_templates: over.templates === null ? [] : (over.templates ?? [template]),
        },
    } as unknown as LifecycleBuilderStageRecord;
}

const notEpp = { missionDerivedFromEffectiveParticipants: false };

describe("familyStageDestinationOperability — execution mode decides reachability", () => {
    it("1 — a stage that DECLARES outcome_led is operable with no primary action", () => {
        // The representative tenant's `tour`: execution_mode outcome_led, helpful actions only.
        const result = familyStageDestinationOperability(
            stage({ key: "tour", execution_mode: "outcome_led" }),
            notEpp,
        );
        expect(result).toEqual({ ok: true });
    });

    it("2 — an action-led stage missing its primary action remains inoperable", () => {
        const result = familyStageDestinationOperability(
            stage({ key: "lead", execution_mode: "direct_action" }),
            notEpp,
        );
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.reason).toContain("offers no reachable primary action");
    });

    it("2b — an action-led stage WITH its primary action is operable", () => {
        expect(
            familyStageDestinationOperability(
                stage({ key: "lead", execution_mode: "direct_action", actionRef: "quick_message" }),
                notEpp,
            ),
        ).toEqual({ ok: true });
    });

    it("3 — an undeclared mode with no action still fails closed", () => {
        // Saying nothing is not the same as declaring outcome-led. `stageOperatingPlanV1`'s parser
        // drops any value outside EXECUTION_MODES, so a malformed mode arrives exactly like this.
        const result = familyStageDestinationOperability(stage({ key: "legacy" }), notEpp);
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.reason).toContain("offers no reachable primary action");
    });

    it("3b — a junk execution mode is not treated as outcome-led", () => {
        const result = familyStageDestinationOperability(
            stage({ key: "junk", execution_mode: "outcome-led" }),
            notEpp,
        );
        expect(result.ok).toBe(false);
    });

    it("keeps refusing a stage with no work templates at all", () => {
        const result = familyStageDestinationOperability(stage({ key: "closed", templates: null }), notEpp);
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.reason).toContain("offers no work templates");
    });

    it("keeps refusing when there is no resolvable stage", () => {
        expect(familyStageDestinationOperability(null, notEpp).ok).toBe(false);
    });

    it("leaves the EPP-derived allowance exactly as it was", () => {
        expect(
            familyStageDestinationOperability(stage({ key: "waitlist" }), {
                missionDerivedFromEffectiveParticipants: true,
            }),
        ).toEqual({ ok: true });
    });
});

describe("childStageDestinationOperability — unchanged by this correction", () => {
    const stages = [stage({ key: "waitlist" })];

    it("is operable for an active configured stage whose segment resolves", () => {
        expect(childStageDestinationOperability("waitlist", stages)).toEqual({ ok: true });
    });

    it("refuses an unresolved stage key", () => {
        expect(childStageDestinationOperability("", stages).ok).toBe(false);
    });

    it("refuses a stage that is not configured", () => {
        const result = childStageDestinationOperability("nope", stages);
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.reason).toContain("not an active configured stage");
    });
});
