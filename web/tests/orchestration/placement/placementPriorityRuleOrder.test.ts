import { describe, expect, it } from "vitest";
import { evaluatePlacementPriority } from "@/lib/orchestration/placement/evaluatePlacementPriority";
import {
    applyPlacementPriorityEffectiveProfile,
    CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1,
    effectivePriorityRuleEnabledSet,
    reorderPriorityRuleMoveDownEnabled,
    reorderPriorityRuleMoveUpEnabled,
    validatePriorityRuleEnabledKeysForProfile,
    validatePriorityRuleOrderForProfile,
} from "@/lib/orchestration/placement/placementPriorityRuleOrder";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";
import type { FactBag, PlacementEvaluateInput } from "@/lib/orchestration/placement/placementPriorityTypes";

const BASE_INPUT = {
    evaluator_version: "1",
    now_ms: 1_715_176_800_000,
    entity: { entity_type: "opportunity", entity_id: "opp_a" },
    cohort: { work_unit_id: "wu_1", queue_key: "waitlisted", status_keys_allowed: ["waitlisted"] },
} satisfies Omit<PlacementEvaluateInput, "facts" | "profile">;

const childcare = CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1;
const orderFull = [...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1];
const fb = childcare.fallback_bucket_key;

describe("validatePriorityRuleOrderForProfile", () => {
    it("rejects unknown bucket key", () => {
        const bad = [...orderFull.slice(0, 3), "tier_fake"];
        const r = validatePriorityRuleOrderForProfile(childcare, bad);
        expect(r.ok).toBe(false);
    });

    it("rejects duplicates", () => {
        const bad = ["tier_staff_community", "tier_staff_community", "tier_sibling_enrolled", fb];
        const r = validatePriorityRuleOrderForProfile(childcare, bad);
        expect(r.ok).toBe(false);
    });

    it("rejects when standard is not last", () => {
        const bad = [fb, "tier_staff_community", "tier_sibling_enrolled", "tier_sister_center"];
        const r = validatePriorityRuleOrderForProfile(childcare, bad);
        expect(r.ok).toBe(false);
    });
});

describe("validatePriorityRuleEnabledKeysForProfile", () => {
    it("requires fallback in enabled set", () => {
        const enabled = new Set(["tier_staff_community", "tier_sibling_enrolled"]);
        const r = validatePriorityRuleEnabledKeysForProfile(childcare, orderFull, enabled);
        expect(r.ok).toBe(false);
    });

    it("rejects unknown enabled key", () => {
        const enabled = new Set([...orderFull, "nope"]);
        const r = validatePriorityRuleEnabledKeysForProfile(childcare, orderFull, enabled);
        expect(r.ok).toBe(false);
    });
});

describe("reorderPriorityRuleMoveUpEnabled / MoveDownEnabled", () => {
    const base = [...orderFull];
    const allOn = new Set(orderFull);

    it("move up swaps two enabled neighbors", () => {
        const next = reorderPriorityRuleMoveUpEnabled(base, allOn, fb, 2);
        expect(next).toEqual(["tier_staff_community", "tier_sister_center", "tier_sibling_enrolled", fb]);
    });

    it("move up skips disabled middle tier", () => {
        const enabled = new Set(["tier_staff_community", "tier_sister_center", fb]);
        const next = reorderPriorityRuleMoveUpEnabled(base, enabled, fb, 2);
        expect(next).not.toBeNull();
        expect(next![next!.length - 1]).toBe(fb);
        expect(next![0]).toBe("tier_sister_center");
    });

    it("move up blocked on fallback row", () => {
        expect(reorderPriorityRuleMoveUpEnabled(base, allOn, fb, base.length - 1)).toBeNull();
    });

    it("move down blocked when would displace standard", () => {
        expect(reorderPriorityRuleMoveDownEnabled(base, allOn, fb, base.length - 2)).toBeNull();
    });
});

describe("applyPlacementPriorityEffectiveProfile", () => {
    it("disabled sibling tier: staff wins when both staff and sibling facts true", () => {
        const enabled = new Set(["tier_staff_community", "tier_sister_center", fb]);
        const profile = applyPlacementPriorityEffectiveProfile(childcare, orderFull, [...enabled]);
        const facts: FactBag = {
            flag_employee_household: { presence: "present", value: true },
            flag_sibling_enrolled: { presence: "present", value: true },
            wait_since: { presence: "present", value: "2024-01-01T00:00:00.000Z" },
        };
        const r = evaluatePlacementPriority({ ...BASE_INPUT, facts, profile });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.snapshot.bucket_key).toBe("tier_staff_community");
    });

    it("program_room_group stays first in sort_tuple", () => {
        const profile = applyPlacementPriorityEffectiveProfile(childcare, orderFull, undefined);
        const facts: FactBag = {
            program_room_group: { presence: "present", value: "Infant" },
            flag_sibling_enrolled: { presence: "present", value: true },
            wait_since: { presence: "present", value: "2024-06-01T00:00:00.000Z" },
        };
        const r = evaluatePlacementPriority({ ...BASE_INPUT, facts, profile });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.snapshot.sort_tuple[0]).toBe("infant");
            expect(r.value.snapshot.program_room_group_label).toBe("Infant");
        }
    });

    it("effectivePriorityRuleEnabledSet defaults to full order", () => {
        const s = effectivePriorityRuleEnabledSet(orderFull, undefined, fb);
        expect(s.size).toBe(4);
        expect(s.has(fb)).toBe(true);
    });
});
