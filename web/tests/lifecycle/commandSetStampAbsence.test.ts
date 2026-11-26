/**
 * A migration that finds nothing must leave the section absent.
 *
 * `ensureProcessCommandSetV1OnSave` stamps `command_set_v1` on every save. When both migration
 * inputs are empty it used to stamp `{ version: 1, commands: [] }` — converting "nobody has selected
 * commands yet" into "the operator selected none". The guard directly above then treats that as
 * intentional forever, so the first save freezes it.
 *
 * The consequence is not cosmetic. `validateProcessCommandSetsForPublish` SKIPS an absent section and
 * reports every Work Template action as un-selected against an empty one. In the certification tenant
 * that turned a clean draft into eleven "not process-selected" errors on the first save, without
 * anyone selecting anything — and it is the same defect that empties the Direct Command / Helpful
 * Action pickers, which filter on the very same selection.
 */

import { describe, expect, it } from "vitest";
import { ensureProcessCommandSetV1OnSave, ensureBuilderCommandSetsOnSave } from "@/lib/lifecycle/ensureProcessCommandSetV1OnSave";
import { validateProcessCommandSetsForPublish } from "@/lib/lifecycle/validateProcessCommandSetsForPublish";
import type { LifecycleBuilderProcessRecord, LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";

/** A process shaped like the certification tenant: work templates, no stage action catalogs. */
function process(overrides?: Partial<LifecycleBuilderProcessRecord>): LifecycleBuilderProcessRecord {
    return {
        id: "p1", key: "enrollment", name: "Enrollment", primary_entity: "opportunity",
        sort_order: 0, is_active: true,
        stages: [
            {
                id: "s1", key: "tour", label: "Tour", sort_order: 0, is_active: true,
                stage_operating_plan_v1: {
                    version: 1, stage_key: "tour", outcomes: [],
                    work_templates: [{ template_key: "conduct_tour", label: "Conduct Tour", helpful_actions: [{ action_ref: "quick_message" }] }],
                },
            },
        ],
        ...overrides,
    } as LifecycleBuilderProcessRecord;
}

describe("an unauthored command set stays unauthored", () => {
    it("leaves the section absent when there is nothing to migrate", () => {
        const out = ensureProcessCommandSetV1OnSave(process());
        expect(out.command_set_v1).toBeUndefined();
    });

    it("does not turn a clean draft into command errors on its first save", () => {
        /*
         * Asserted against the validator that OWNS the rule, not the outer publish validator.
         *
         * The outer one parses the stored payload first, and `parseStageOperatingPlanV1` rejects a
         * synthetic operating plan — so routing through it made this assertion pass without
         * exercising anything. It did exactly that on the unfixed code before this was corrected.
         */
        const config = { version: 1, active_process_id: "p1", processes: [process()] } as LifecycleBuilderV1;
        const saved = ensureBuilderCommandSetsOnSave(config);
        const result = validateProcessCommandSetsForPublish(saved);
        expect(result.ok, "a draft nobody configured commands for must not report orphans").toBe(true);
    });

    it("and the same draft DOES report them once an empty selection is stamped", () => {
        // The positive control. Without it, the assertion above could pass because the validator
        // never sees this shape at all rather than because the fix works.
        const stamped = { version: 1, active_process_id: "p1", processes: [process({ command_set_v1: { version: 1, commands: [] } })] } as LifecycleBuilderV1;
        const result = validateProcessCommandSetsForPublish(stamped);
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.issues.some((i) => i.capabilityKey === "quick_message")).toBe(true);
    });

    it("still migrates when a stage catalog actually offers something", () => {
        // The fix must not disable migration — only stop it inventing an authored empty.
        const withCatalog = process();
        (withCatalog.stages[0] as Record<string, unknown>).action_catalog_v1 = {
            version: 1,
            candidate_actions: [{ action_key: "quick_message" }],
        };
        const out = ensureProcessCommandSetV1OnSave(withCatalog);
        expect(out.command_set_v1?.commands.map((c) => c.capability_key)).toContain("quick_message");
    });

    it("still respects an operator's deliberate empty selection", () => {
        // Authored-empty is a real decision and must survive; only the manufactured one is refused.
        const authored = process({ command_set_v1: { version: 1, commands: [] } });
        expect(ensureProcessCommandSetV1OnSave(authored).command_set_v1).toEqual({ version: 1, commands: [] });
    });

    it("keeps an existing non-empty selection", () => {
        const authored = process({ command_set_v1: { version: 1, commands: [{ capability_key: "quick_message", enabled: true }] } });
        expect(ensureProcessCommandSetV1OnSave(authored).command_set_v1?.commands).toHaveLength(1);
    });
});
