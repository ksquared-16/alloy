/**
 * Three states of a command selection, and the middle one used to be read as the last.
 *
 *   absent      no selection authored → NO restriction
 *   []          the operator deliberately selected none → nothing passes
 *   populated   only what was selected passes
 *
 * Two canonical readers disagreed about absence. `validateProcessCommandSetsForPublish` skipped it;
 * `isCapabilityInProcessSelection` fell through to a migration that returns empty in a tenant with no
 * stage action catalogs, and denied everything — so the Direct Command and Helpful Action pickers
 * rendered empty with nothing actually wrong. The guard even disagreed with itself: a null PROCESS
 * was unrestricted while a process with no selection was fully restricted.
 *
 * These controls pin all three states across BOTH readers, because the defect was not either reader
 * being wrong on its own — it was the two of them meaning different things by the same absence.
 */

import { describe, expect, it } from "vitest";
import { ensureProcessCommandSetV1OnSave, isCapabilityInProcessSelection } from "@/lib/lifecycle/ensureProcessCommandSetV1OnSave";
import { validateProcessCommandSetsForPublish } from "@/lib/lifecycle/validateProcessCommandSetsForPublish";
import type { LifecycleBuilderProcessRecord, LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";

const CAP = "quick_message";

/** Shaped like the certification tenant: a work template referencing a capability, no stage catalog. */
function process(overrides?: Partial<LifecycleBuilderProcessRecord>): LifecycleBuilderProcessRecord {
    return {
        id: "p1", key: "enrollment", name: "Enrollment", primary_entity: "opportunity",
        sort_order: 0, is_active: true,
        stages: [{
            id: "s1", key: "tour", label: "Tour", sort_order: 0, is_active: true,
            stage_operating_plan_v1: {
                version: 1, stage_key: "tour", outcomes: [],
                work_templates: [{ template_key: "conduct_tour", label: "Conduct Tour", helpful_actions: [{ action_ref: CAP }] }],
            },
        }],
        ...overrides,
    } as LifecycleBuilderProcessRecord;
}
const asConfig = (p: LifecycleBuilderProcessRecord) => ({ version: 1, active_process_id: "p1", processes: [p] }) as LifecycleBuilderV1;

describe("absent selection means no restriction has been authored", () => {
    it("permits an otherwise-valid capability", () => {
        expect(isCapabilityInProcessSelection(process(), CAP)).toBe(true);
    });

    it("agrees with the validator, which skips an absent section", () => {
        expect(validateProcessCommandSetsForPublish(asConfig(process())).ok).toBe(true);
    });

    it("reads the same as having no process at all", () => {
        // The guard used to contradict itself here: no process was unrestricted, no selection was not.
        expect(isCapabilityInProcessSelection(null, CAP)).toBe(isCapabilityInProcessSelection(process(), CAP));
    });
});

describe("an explicit empty selection stays authoritative", () => {
    const empty = () => process({ command_set_v1: { version: 1, commands: [] } });

    it("denies every capability", () => {
        expect(isCapabilityInProcessSelection(empty(), CAP)).toBe(false);
    });

    it("and the validator reports the orphan, so both readers agree", () => {
        const result = validateProcessCommandSetsForPublish(asConfig(empty()));
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.issues.some((i) => i.capabilityKey === CAP)).toBe(true);
    });

    it("survives a save untouched — deliberate none is not migrate-filled", () => {
        expect(ensureProcessCommandSetV1OnSave(empty()).command_set_v1).toEqual({ version: 1, commands: [] });
    });
});

describe("a populated selection permits only what it names", () => {
    const populated = () => process({ command_set_v1: { version: 1, commands: [{ capability_key: CAP, enabled: true }] } });

    it("permits the selected capability and refuses an unselected one", () => {
        expect(isCapabilityInProcessSelection(populated(), CAP)).toBe(true);
        expect(isCapabilityInProcessSelection(populated(), "schedule_tour")).toBe(false);
    });

    it("and the validator passes, so both readers agree", () => {
        expect(validateProcessCommandSetsForPublish(asConfig(populated())).ok).toBe(true);
    });
});

describe("save never manufactures presence", () => {
    it("leaves an unauthored selection absent", () => {
        expect(ensureProcessCommandSetV1OnSave(process()).command_set_v1).toBeUndefined();
    });

    it("so the permissive reading is what a saved draft actually gets", () => {
        // The end of the chain: save, then ask the guard the same question the pickers ask.
        const saved = ensureProcessCommandSetV1OnSave(process());
        expect(isCapabilityInProcessSelection(saved, CAP)).toBe(true);
    });
});

describe("a derivable legacy selection is still a selection", () => {
    it("restricts when stage catalogs actually name commands", () => {
        // The permissive branch is for an EMPTY derivation only. A legacy process whose catalogs name
        // commands has really chosen them, and must keep restricting.
        const legacy = process();
        (legacy.stages[0] as Record<string, unknown>).action_catalog_v1 = {
            version: 1, candidate_actions: [{ action_key: CAP }],
        };
        expect(isCapabilityInProcessSelection(legacy, CAP)).toBe(true);
        expect(isCapabilityInProcessSelection(legacy, "schedule_tour")).toBe(false);
    });
});
