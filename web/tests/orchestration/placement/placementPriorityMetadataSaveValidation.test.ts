import { describe, expect, it } from "vitest";
import { deepMergeJsonObjects } from "@/lib/json/deepMergeJsonObjects";
import { validateMergedWorkUnitMetadataForPlacementSave } from "@/lib/orchestration/placement/placementPriorityMetadataSaveValidation";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";
import { CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1 } from "@/lib/orchestration/placement/placementPriorityRuleOrder";

const validLayer = {
    version: 1 as const,
    enabled: true,
    profile_id: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.profile_id,
    profile_revision: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.revision,
    queue_keys_enabled: ["waitlisted"],
    shadow_mode: false,
    evaluation_cap: 200,
    display: { show_bucket_chip: true, show_sort_hint: true },
};

describe("validateMergedWorkUnitMetadataForPlacementSave", () => {
    it("accepts valid registered profile_id and matching revision", () => {
        const r = validateMergedWorkUnitMetadataForPlacementSave({
            placement_priority_v1: validLayer,
        });
        expect(r.ok).toBe(true);
    });

    it("rejects unknown profile_id with clear error", () => {
        const r = validateMergedWorkUnitMetadataForPlacementSave({
            placement_priority_v1: {
                ...validLayer,
                profile_id: "not_a_real_preset_v1",
            },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toMatch(/Unknown placement profile_id/i);
            expect(r.error).toContain("not_a_real_preset_v1");
        }
    });

    it("rejects profile_revision mismatch when revision is supplied", () => {
        const r = validateMergedWorkUnitMetadataForPlacementSave({
            placement_priority_v1: {
                ...validLayer,
                profile_revision: "2099-01-01",
            },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toMatch(/profile_revision/i);
            expect(r.error).toMatch(/expected/i);
        }
    });

    it("allows omitted profile_revision (pins client-side on next save)", () => {
        const { profile_revision: _r, ...noRev } = validLayer;
        const r = validateMergedWorkUnitMetadataForPlacementSave({
            placement_priority_v1: noRev,
        });
        expect(r.ok).toBe(true);
    });

    it("rejects enabled true without profile_id", () => {
        const r = validateMergedWorkUnitMetadataForPlacementSave({
            placement_priority_v1: {
                version: 1,
                enabled: true,
                shadow_mode: false,
                evaluation_cap: 50,
            },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/enabled is true.*profile_id/i);
    });

    it("accepts metadata with no placement key", () => {
        expect(validateMergedWorkUnitMetadataForPlacementSave({ other: 1 }).ok).toBe(true);
    });

    it("normalizes legacy short priority_rule_order for childcare preset", () => {
        const r = validateMergedWorkUnitMetadataForPlacementSave({
            placement_priority_v1: {
                ...validLayer,
                priority_rule_order: ["tier_staff_community", "tier_general_waitlist"],
            },
        });
        expect(r.ok).toBe(true);
    });

    it("strips unknown bucket keys and normalizes order on save", () => {
        const r = validateMergedWorkUnitMetadataForPlacementSave({
            placement_priority_v1: {
                ...validLayer,
                priority_rule_order: ["tier_fake_bucket", "tier_general_waitlist"],
            },
        });
        expect(r.ok).toBe(true);
    });

    it("rejects priority_rule_enabled_keys without priority_rule_order", () => {
        const r = validateMergedWorkUnitMetadataForPlacementSave({
            placement_priority_v1: {
                version: 1,
                enabled: false,
                profile_id: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.profile_id,
                priority_rule_enabled_keys: ["tier_general_waitlist"],
            },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/priority_rule_enabled_keys requires priority_rule_order/i);
    });

    it("rejects priority_rule_order without profile_id", () => {
        const r = validateMergedWorkUnitMetadataForPlacementSave({
            placement_priority_v1: {
                version: 1,
                enabled: false,
                priority_rule_order: [...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1],
            },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/requires profile_id/i);
    });
});

describe("deepMergeJsonObjects (work unit metadata)", () => {
    it("preserves unrelated keys when merging placement_priority_v1", () => {
        const prev = {
            enrollment_demo_tag: "keep-me",
            placement_priority_v1: { version: 1, enabled: false, profile_id: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.profile_id },
        };
        const patch = {
            placement_priority_v1: validLayer,
        };
        const merged = deepMergeJsonObjects(prev, patch);
        expect(merged.enrollment_demo_tag).toBe("keep-me");
        expect((merged.placement_priority_v1 as { enabled: boolean }).enabled).toBe(true);
        expect((merged.placement_priority_v1 as { evaluation_cap: number }).evaluation_cap).toBe(200);
    });
});
