import { describe, expect, it } from "vitest";
import {
    mergePlacementPriorityLayers,
    parsePlacementPriorityLayerStrict,
    PLACEMENT_EVALUATION_CAP_MAX,
    placementPriorityLayerSchema,
} from "@/lib/orchestration/placement/placementConfigSchema";
import {
    getPlacementProfileFromRegistry,
    isRegisteredPlacementProfileId,
    listRegisteredPlacementProfileIds,
} from "@/lib/orchestration/placement/placementPresetRegistry";
import {
    resolvePlacementQueueConfig,
    validatePlacementMetadataLayers,
} from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";

const childcareId = CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.profile_id;

describe("placementPresetRegistry", () => {
    it("lists childcare preset", () => {
        expect(listRegisteredPlacementProfileIds()).toContain(childcareId);
        expect(isRegisteredPlacementProfileId(childcareId)).toBe(true);
        expect(getPlacementProfileFromRegistry(childcareId)?.profile_id).toBe(childcareId);
    });
});

describe("placementConfigSchema", () => {
    it("rejects evaluation_cap above max", () => {
        const r = placementPriorityLayerSchema.safeParse({
            version: 1,
            enabled: true,
            profile_id: childcareId,
            evaluation_cap: PLACEMENT_EVALUATION_CAP_MAX + 1,
        });
        expect(r.success).toBe(false);
    });

    it("parsePlacementPriorityLayerStrict surfaces invalid version", () => {
        const r = parsePlacementPriorityLayerStrict({
            placement_priority_v1: { version: 2, enabled: true },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
    });
});

describe("mergePlacementPriorityLayers", () => {
    it("work unit overrides department", () => {
        const m = mergePlacementPriorityLayers(
            {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: childcareId,
                    evaluation_cap: 100,
                },
            },
            {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: childcareId,
                    evaluation_cap: 400,
                    shadow_mode: true,
                },
            }
        );
        expect(m.evaluation_cap).toBe(400);
        expect(m.shadow_mode).toBe(true);
    });

    it("defaults disabled when layers absent", () => {
        const m = mergePlacementPriorityLayers({}, {});
        expect(m.enabled).toBe(false);
    });
});

describe("resolvePlacementQueueConfig", () => {
    it("disabled by default", () => {
        const r = resolvePlacementQueueConfig({
            departmentMetadata: {},
            workUnitMetadata: {},
            queue_key: "waitlisted",
        });
        expect(r.status).toBe("disabled");
    });

    it("enabled for waitlisted when configured on work unit", () => {
        const r = resolvePlacementQueueConfig({
            departmentMetadata: {},
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: childcareId,
                    queue_keys_enabled: ["waitlisted"],
                },
            },
            queue_key: "waitlisted",
        });
        expect(r.status).toBe("enabled");
        if (r.status === "enabled") {
            expect(r.profile.profile_id).toBe(childcareId);
            expect(r.options.profile_revision_mismatch).toBe(false);
        }
    });

    it("disabled when queue_key not in queue_keys_enabled", () => {
        const r = resolvePlacementQueueConfig({
            departmentMetadata: {},
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: childcareId,
                    queue_keys_enabled: ["ready_to_enroll"],
                },
            },
            queue_key: "waitlisted",
        });
        expect(r.status).toBe("disabled");
    });

    it("disabled for unknown profile_id", () => {
        const r = resolvePlacementQueueConfig({
            departmentMetadata: {},
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: "unknown_preset_xyz",
                },
            },
            queue_key: "waitlisted",
        });
        expect(r.status).toBe("disabled");
    });

    it("missing_fact_behavior strict upgrades profile strict flag", () => {
        const r = resolvePlacementQueueConfig({
            departmentMetadata: {},
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: childcareId,
                    missing_fact_behavior: "strict",
                },
            },
            queue_key: "waitlisted",
        });
        expect(r.status).toBe("enabled");
        if (r.status === "enabled") expect(r.options.strict_required_facts).toBe(true);
    });

    it("flags profile_revision_mismatch when pin differs", () => {
        const r = resolvePlacementQueueConfig({
            departmentMetadata: {},
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: childcareId,
                    profile_revision: "not-the-registry-revision",
                },
            },
            queue_key: "waitlisted",
        });
        expect(r.status).toBe("enabled");
        if (r.status === "enabled") expect(r.options.profile_revision_mismatch).toBe(true);
    });

    it("applies priority_rule_order so sibling rule is evaluated before employee", () => {
        const order = [
            "tier_sibling_enrolled",
            "tier_employee_family",
            "tier_staff_community",
            "tier_sister_center",
            "tier_general_waitlist",
        ];
        const r = resolvePlacementQueueConfig({
            departmentMetadata: {},
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: childcareId,
                    queue_keys_enabled: ["waitlisted"],
                    priority_rule_order: order,
                },
            },
            queue_key: "waitlisted",
        });
        expect(r.status).toBe("enabled");
        if (r.status === "enabled") {
            expect(r.profile.rules[0]?.assign_bucket_key).toBe("tier_sibling_enrolled");
        }
    });

    it("normalizes legacy short priority_rule_order instead of disabling", () => {
        const r = resolvePlacementQueueConfig({
            departmentMetadata: {},
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: childcareId,
                    priority_rule_order: ["tier_staff_community", "tier_general_waitlist"],
                },
            },
            queue_key: "waitlisted",
        });
        expect(r.status).toBe("enabled");
    });

    it("omits disabled tier rules from effective profile", () => {
        const order = [
            "tier_employee_family",
            "tier_staff_community",
            "tier_sibling_enrolled",
            "tier_sister_center",
            "tier_general_waitlist",
        ];
        const r = resolvePlacementQueueConfig({
            departmentMetadata: {},
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: childcareId,
                    queue_keys_enabled: ["waitlisted"],
                    priority_rule_order: order,
                    priority_rule_enabled_keys: ["tier_employee_family", "tier_sister_center", "tier_general_waitlist"],
                },
            },
            queue_key: "waitlisted",
        });
        expect(r.status).toBe("enabled");
        if (r.status === "enabled") {
            expect(r.profile.rules.some((x) => x.assign_bucket_key === "tier_sibling_enrolled")).toBe(false);
        }
    });
});

describe("validatePlacementMetadataLayers", () => {
    it("passes empty metadata", () => {
        expect(validatePlacementMetadataLayers({ departmentMetadata: {}, workUnitMetadata: {} }).ok).toBe(true);
    });
});
