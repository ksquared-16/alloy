/**
 * The canonical representative seed must be publishable, untouched.
 *
 * Browser certification of the Stage editor found it was not: three transitions targeted
 * `closed_lost` where the stage is `closed`, and the waitlist stage moved to `enrollment` where the
 * stage is `enrolling` — via a bare `stage_key` with no transition at all. Seven blocking errors,
 * so a freshly seeded tenant could never publish its own configuration.
 *
 * This test reads the real seed file rather than a fixture. A fixture would have let the seed drift
 * back out of validity without anything noticing, which is exactly how it got here.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import {
    activeLifecycleProcess,
    parseLifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

const SEED = resolve(__dirname, "../../../supabase/seed/local_representative_seed.sql");

/**
 * The seed embeds the whole builder as one dollar-quoted JSON literal:
 *   SET metadata = $json${...}$json$::jsonb
 */
function seededBuilderPayload(): Record<string, unknown> {
    const sql = readFileSync(SEED, "utf8");
    const start = sql.indexOf("$json$");
    const end = sql.indexOf("$json$", start + 6);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const metadata = JSON.parse(sql.slice(start + 6, end)) as Record<string, unknown>;
    return metadata.lifecycle_builder_v1 as Record<string, unknown>;
}

describe("canonical representative seed — execution graph", () => {
    const payload = seededBuilderPayload();

    it("publishes cleanly with no blocking errors", () => {
        const result = validateBusinessProcessForPublish(payload);
        // Print the messages on failure — this is the seed, so a regression here is worth reading.
        expect(result.errors.map((e) => e.message)).toEqual([]);
        expect(result.errors).toHaveLength(0);
    });

    it("uses the decided 8-key stage vocabulary (decision D2)", () => {
        const builder = parseLifecycleBuilderV1(payload)!;
        const process = activeLifecycleProcess(builder)!;
        expect(process.stages.filter((s) => s.is_active).map((s) => s.key).sort()).toEqual([
            "closed",
            "closed_withdrawn",
            "decision",
            "enrolled",
            "enrolling",
            "lead",
            "tour",
            "waitlist",
        ]);
        // The retired 13-key vocabulary must not creep back in.
        const raw = JSON.stringify(payload);
        for (const retired of ["new_lead", "tour_scheduled", "tour_completed", "qualification", "decision_pending"]) {
            expect(raw).not.toContain(`"key":"${retired}"`);
        }
    });

    it("every transition resolves to a configured source and destination", () => {
        const builder = parseLifecycleBuilderV1(payload)!;
        const process = activeLifecycleProcess(builder)!;
        const stageKeys = new Set(process.stages.filter((s) => s.is_active).map((s) => s.key));

        const seen = new Set<string>();
        for (const stage of process.stages) {
            for (const t of stage.stage_operating_plan_v1?.outgoing_transitions ?? []) {
                expect(stageKeys, `${t.transition_ref} source`).toContain(t.source_stage_key);
                expect(stageKeys, `${t.transition_ref} destination`).toContain(t.target_stage_key);
                // Outgoing means outgoing FROM the stage that declares it.
                expect(t.source_stage_key, `${t.transition_ref} declared on the wrong stage`).toBe(
                    stage.key,
                );
                expect(seen.has(t.transition_ref), `duplicate ${t.transition_ref}`).toBe(false);
                seen.add(t.transition_ref);
            }
        }
        expect(seen.size).toBeGreaterThan(0);
    });

    it("every outcome that moves a subject references a transition its own stage declares", () => {
        const builder = parseLifecycleBuilderV1(payload)!;
        const process = activeLifecycleProcess(builder)!;

        for (const stage of process.stages) {
            const plan = stage.stage_operating_plan_v1;
            if (!plan) continue;
            const outgoing = new Set(
                (plan.outgoing_transitions ?? []).map((t) => t.transition_ref),
            );
            for (const rule of plan.outcome_rules ?? []) {
                for (const target of rule.targets ?? []) {
                    if (target.kind !== "move_to_stage") continue;
                    // A move must name a transition this stage actually declares. A bare
                    // `stage_key` is the legacy shape that let `enrollment` (not a stage) survive.
                    expect(
                        target.transition_ref,
                        `${stage.key}/${rule.rule_key} moves without a transition_ref`,
                    ).toBeTruthy();
                    expect(outgoing, `${stage.key}/${rule.rule_key}`).toContain(
                        target.transition_ref!,
                    );
                }
            }
        }
    });

    it("declares the Lead → Tour transition the Firefly failure is about", () => {
        const builder = parseLifecycleBuilderV1(payload)!;
        const lead = activeLifecycleProcess(builder)!.stages.find((s) => s.key === "lead")!;
        const leadToTour = lead.stage_operating_plan_v1?.outgoing_transitions?.find(
            (t) => t.transition_ref === "lead_to_tour",
        );
        expect(leadToTour).toBeTruthy();
        expect(leadToTour!.target_stage_key).toBe("tour");
        expect(leadToTour!.source_stage_key).toBe("lead");
    });
});
