import { describe, it, expect } from "vitest";
import {
    buildPacketComposerItems,
    reorderFormSelection,
    buildPacketLaunchPlan,
    type ComposerAnchor,
} from "@/lib/pos/packet/packetComposerPlan";

describe("buildPacketComposerItems", () => {
    it("creates ordered, sequential items preserving order", () => {
        const r = buildPacketComposerItems(["f1", "f2", "f3"]);
        expect(r.ok).toBe(true);
        expect(r.items).toEqual([
            { form_definition_id: "f1", sequence_index: 0 },
            { form_definition_id: "f2", sequence_index: 1 },
            { form_definition_id: "f3", sequence_index: 2 },
        ]);
    });

    it("de-duplicates while preserving first position", () => {
        const r = buildPacketComposerItems(["f1", "f2", "f1", "f3"]);
        expect(r.items.map((i) => i.form_definition_id)).toEqual(["f1", "f2", "f3"]);
        expect(r.items.map((i) => i.sequence_index)).toEqual([0, 1, 2]);
    });

    it("attaches step labels when provided", () => {
        const r = buildPacketComposerItems(["f1"], { f1: "Child Info" });
        expect(r.items[0].step_label).toBe("Child Info");
    });

    it("fails when no forms selected", () => {
        expect(buildPacketComposerItems([]).ok).toBe(false);
        expect(buildPacketComposerItems(["", "  "]).ok).toBe(false);
    });
});

describe("reorderFormSelection", () => {
    it("moves an item and returns a new array", () => {
        expect(reorderFormSelection(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
        expect(reorderFormSelection(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    });
    it("returns an unchanged copy for out-of-range / no-op", () => {
        expect(reorderFormSelection(["a", "b"], 0, 0)).toEqual(["a", "b"]);
        expect(reorderFormSelection(["a", "b"], 5, 0)).toEqual(["a", "b"]);
    });
});

describe("buildPacketLaunchPlan (child-recipient fan-out)", () => {
    const oppAnchor: ComposerAnchor = { entity_type: "opportunity", entity_id: "opp1", opportunity_id: "opp1", customer_id: "cust1" };

    it("produces one spec per child-recipient pair (cartesian)", () => {
        const plan = buildPacketLaunchPlan(oppAnchor, ["c1", "c2"], ["r1", "r2"]);
        expect(plan.specs).toHaveLength(4);
        expect(plan.specs.map((s) => s.pair_key)).toEqual(["c1::r1", "c1::r2", "c2::r1", "c2::r2"]);
        // opportunity anchor → enrollment_selection carries both ids for full prefill
        expect(plan.specs[0].enrollment_selection).toEqual({ customer_member_id: "c1", recipient_person_id: "r1" });
        expect(plan.specs[0].launch_from_entity).toEqual({ entity_type: "opportunity", entity_id: "opp1", prefill_enabled: true });
    });

    it("never reuses one generic link for multiple people (distinct specs)", () => {
        const plan = buildPacketLaunchPlan(oppAnchor, ["c1", "c2"], ["r1"]);
        expect(plan.specs).toHaveLength(2);
        expect(new Set(plan.specs.map((s) => s.pair_key)).size).toBe(2);
    });

    it("one link per child when no recipients", () => {
        const plan = buildPacketLaunchPlan(oppAnchor, ["c1", "c2"], []);
        expect(plan.specs.map((s) => s.pair_key)).toEqual(["c1::-", "c2::-"]);
        expect(plan.warnings.some((w) => /recipient/i.test(w))).toBe(true);
    });

    it("one link per recipient when no children", () => {
        const plan = buildPacketLaunchPlan(oppAnchor, [], ["r1", "r2"]);
        expect(plan.specs.map((s) => s.pair_key)).toEqual(["-::r1", "-::r2"]);
        expect(plan.warnings.some((w) => /child/i.test(w))).toBe(true);
    });

    it("dedupes duplicate ids", () => {
        const plan = buildPacketLaunchPlan(oppAnchor, ["c1", "c1"], ["r1", "r1"]);
        expect(plan.specs).toHaveLength(1);
    });

    it("falls back to customer_member launch when anchor is a household (no opportunity)", () => {
        const custAnchor: ComposerAnchor = { entity_type: "customer", entity_id: "cust1", customer_id: "cust1" };
        const plan = buildPacketLaunchPlan(custAnchor, ["c1"], ["r1"]);
        expect(plan.specs[0].launch_from_entity).toEqual({ entity_type: "customer_member", entity_id: "c1", prefill_enabled: true });
        // enrollment_selection still carried (harmless for non-opportunity mint)
        expect(plan.specs[0].enrollment_selection).toEqual({ customer_member_id: "c1", recipient_person_id: "r1" });
    });
});
