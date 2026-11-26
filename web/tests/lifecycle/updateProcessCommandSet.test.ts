/**
 * Command-set membership becomes authorable — and only for capabilities the platform can vouch for.
 *
 * `command_set_v1` was authored configuration with no authoring path: only the automatic stamp ever
 * wrote it. So a Work Template could reference a capability the process had not selected,
 * publication would refuse the process, and no operator surface could resolve the disagreement.
 *
 * The rule these tests hold: an addition must resolve through the canonical registry, and the
 * CANONICAL key is what gets stored. Raw-key fallback is how an unimplemented command gets
 * authorized by accident — an unknown key is the live example; create_task maps to create_work_item.
 */

import { describe, expect, it } from "vitest";

import { updateProcessCommandSet, type LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";

function config(commands: Array<{ capability_key: string; enabled: boolean }> = [
    { capability_key: "update_lead_status", enabled: true },
]): LifecycleBuilderV1 {
    return {
        version: 1,
        active_process_id: "p1",
        processes: [
            {
                id: "p1",
                key: "enrollment",
                name: "Enrollment",
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                command_set_v1: { version: 1, commands },
                stages: [{ id: "s1", key: "lead", label: "Lead", sort_order: 0, is_active: true, grain: "family" }],
            },
        ],
    } as unknown as LifecycleBuilderV1;
}
const keysOf = (c: LifecycleBuilderV1) =>
    (c.processes[0]!.command_set_v1?.commands ?? []).map((x) => x.capability_key);

describe("adding capabilities", () => {
    it("adds a registered production capability", () => {
        const r = updateProcessCommandSet(config(), "p1", { addCapabilityKeys: ["add_child"] });
        expect(r.added).toEqual(["add_child"]);
        expect(keysOf(r.config)).toEqual(["update_lead_status", "add_child"]);
    });

    it("adds quick_message — registered, executable, partial only by naming drift", () => {
        const r = updateProcessCommandSet(config(), "p1", { addCapabilityKeys: ["quick_message"] });
        expect(r.rejected).toEqual([]);
        expect(keysOf(r.config)).toContain("quick_message");
    });

    it("maps create_task onto create_work_item (Work Item, not an unknown Task command)", () => {
        const r = updateProcessCommandSet(config(), "p1", { addCapabilityKeys: ["create_task"] });
        expect(r.rejected).toEqual([]);
        expect(r.added).toEqual(["create_work_item"]);
        expect(keysOf(r.config)).toEqual(["update_lead_status", "create_work_item"]);
    });

    it("rejects an unregistered key without dropping the valid ones from the same request", () => {
        const r = updateProcessCommandSet(config(), "p1", {
            addCapabilityKeys: ["add_child", "totally_unknown_capability_xyz"],
        });
        expect(r.added).toEqual(["add_child"]);
        expect(r.rejected.map((x) => x.requested)).toEqual(["totally_unknown_capability_xyz"]);
        // The route refuses the whole request when anything is rejected; the model still reports
        // both halves so the blocker can name exactly what failed.
    });

    it("persists the canonical key, not the input alias", () => {
        const r = updateProcessCommandSet(config(), "p1", { addCapabilityKeys: ["  add_child  "] });
        expect(keysOf(r.config)).toContain("add_child");
        expect(keysOf(r.config)).not.toContain("  add_child  ");
    });

    it("is idempotent — adding an already-present capability changes nothing", () => {
        const first = updateProcessCommandSet(config(), "p1", { addCapabilityKeys: ["add_child"] });
        const second = updateProcessCommandSet(first.config, "p1", { addCapabilityKeys: ["add_child"] });
        expect(second.added).toEqual([]);
        expect(second.config).toBe(first.config);
    });

    it("does not silently re-enable an explicitly disabled command", () => {
        const disabled = config([
            { capability_key: "update_lead_status", enabled: true },
            { capability_key: "add_child", enabled: false },
        ]);
        const r = updateProcessCommandSet(disabled, "p1", { addCapabilityKeys: ["add_child"] });
        expect(r.added).toEqual([]);
        expect(r.config.processes[0]!.command_set_v1!.commands.find((c) => c.capability_key === "add_child")!.enabled)
            .toBe(false);
    });

    it("appends, so existing ordering is untouched", () => {
        const r = updateProcessCommandSet(config(), "p1", {
            addCapabilityKeys: ["add_child", "schedule_tour"],
        });
        expect(keysOf(r.config)).toEqual(["update_lead_status", "add_child", "schedule_tour"]);
    });
});

describe("removing capabilities", () => {
    it("removes a present capability", () => {
        const withChild = updateProcessCommandSet(config(), "p1", { addCapabilityKeys: ["add_child"] }).config;
        const r = updateProcessCommandSet(withChild, "p1", { removeCapabilityKeys: ["add_child"] });
        expect(r.removed).toEqual(["add_child"]);
        expect(keysOf(r.config)).toEqual(["update_lead_status"]);
    });

    it("removing a missing capability is an idempotent no-op", () => {
        const before = config();
        const r = updateProcessCommandSet(before, "p1", { removeCapabilityKeys: ["add_child"] });
        expect(r.removed).toEqual([]);
        expect(r.config).toBe(before);
    });
});

describe("everything else is left alone", () => {
    it("does not mutate the config it was given", () => {
        const before = config();
        const snapshot = JSON.parse(JSON.stringify(before));
        updateProcessCommandSet(before, "p1", { addCapabilityKeys: ["add_child"] });
        expect(before).toEqual(snapshot);
    });

    it("leaves stages and unrelated commands byte-identical", () => {
        const before = config([
            { capability_key: "update_lead_status", enabled: true },
            { capability_key: "close_lead", enabled: false },
        ]);
        const r = updateProcessCommandSet(before, "p1", { addCapabilityKeys: ["add_child"] });
        expect(r.config.processes[0]!.stages).toEqual(before.processes[0]!.stages);
        expect(keysOf(r.config).slice(0, 2)).toEqual(["update_lead_status", "close_lead"]);
    });

    it("rejects an unknown process", () => {
        expect(() => updateProcessCommandSet(config(), "nope", { addCapabilityKeys: ["add_child"] })).toThrow(
            "Process not found",
        );
    });
});
