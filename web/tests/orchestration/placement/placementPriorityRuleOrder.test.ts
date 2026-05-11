import { describe, expect, it } from "vitest";
import { evaluatePlacementPriority } from "@/lib/orchestration/placement/evaluatePlacementPriority";
import {
    applyPriorityRuleOrderToProfile,
    CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1,
    reorderPriorityRuleMoveDown,
    reorderPriorityRuleMoveUp,
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

describe("validatePriorityRuleOrderForProfile", () => {
    it("rejects unknown bucket key", () => {
        const bad = [...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1.slice(0, 3), "tier_fake"];
        const r = validatePriorityRuleOrderForProfile(CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1, bad);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/Unknown/i);
    });

    it("rejects duplicates", () => {
        const bad = [
            "tier_staff_community",
            "tier_staff_community",
            "tier_sibling_enrolled",
            "tier_general_waitlist",
        ];
        const r = validatePriorityRuleOrderForProfile(CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1, bad);
        expect(r.ok).toBe(false);
    });

    it("rejects when standard is not last", () => {
        const bad = [
            "tier_general_waitlist",
            "tier_staff_community",
            "tier_sibling_enrolled",
            "tier_sister_center",
        ];
        const r = validatePriorityRuleOrderForProfile(CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1, bad);
        expect(r.ok).toBe(false);
    });

    it("accepts default permutation", () => {
        const r = validatePriorityRuleOrderForProfile(
            CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1,
            [...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1]
        );
        expect(r.ok).toBe(true);
    });
});

describe("reorderPriorityRuleMoveUp / MoveDown", () => {
    const fb = CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.fallback_bucket_key;
    const base = [...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1];

    it("move up swaps when safe", () => {
        const next = reorderPriorityRuleMoveUp(base, 2, fb);
        expect(next).toEqual(["tier_staff_community", "tier_sister_center", "tier_sibling_enrolled", fb]);
    });

    it("move down blocked when would displace standard", () => {
        expect(reorderPriorityRuleMoveDown(base, base.length - 2, fb)).toBeNull();
    });

    it("move up blocked on standard row", () => {
        expect(reorderPriorityRuleMoveUp(base, base.length - 1, fb)).toBeNull();
    });
});

describe("applyPriorityRuleOrderToProfile + evaluator", () => {
    it("custom order: sibling matches before staff when both flags true", () => {
        const order = ["tier_sibling_enrolled", "tier_staff_community", "tier_sister_center", "tier_general_waitlist"];
        const profile = applyPriorityRuleOrderToProfile(CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1, order);
        const facts: FactBag = {
            flag_employee_household: { presence: "present", value: true },
            flag_sibling_enrolled: { presence: "present", value: true },
            wait_since: { presence: "present", value: "2024-01-01T00:00:00.000Z" },
        };
        const r = evaluatePlacementPriority({
            ...BASE_INPUT,
            facts,
            profile,
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.snapshot.bucket_key).toBe("tier_sibling_enrolled");
    });

    it("program_room_group stays first in sort_tuple (grouping unchanged)", () => {
        const order = ["tier_sibling_enrolled", "tier_staff_community", "tier_sister_center", "tier_general_waitlist"];
        const profile = applyPriorityRuleOrderToProfile(CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1, order);
        const facts: FactBag = {
            program_room_group: { presence: "present", value: "Infant" },
            flag_sibling_enrolled: { presence: "present", value: true },
            wait_since: { presence: "present", value: "2024-06-01T00:00:00.000Z" },
        };
        const r = evaluatePlacementPriority({
            ...BASE_INPUT,
            facts,
            profile,
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.snapshot.sort_tuple[0]).toBe("infant");
            expect(r.value.snapshot.program_room_group_label).toBe("Infant");
        }
    });
});
