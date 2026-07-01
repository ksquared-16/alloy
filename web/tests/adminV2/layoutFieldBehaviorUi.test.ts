import { describe, expect, it } from "vitest";
import {
    buildLayoutFieldBehaviorView,
    LAYOUT_FIELD_BEHAVIOR_HELPER,
    LAYOUT_INTERACTION_CONTROL_LABEL,
    LAYOUT_REQUIREMENT_CONTROL_LABEL,
    layoutFieldBehaviorControlsEnabled,
    layoutRequirementPresetLabel,
} from "@/lib/adminV2/layouts/layoutFieldBehaviorUi";
import { buildSimpleRequirementPolicy } from "@/lib/fields/fieldPolicySettingsUi";

describe("layoutFieldBehaviorUi", () => {
    it("enables controls only for opportunity workflow v1 when section allows behavior", () => {
        expect(
            layoutFieldBehaviorControlsEnabled({
                entityType: "opportunity",
                workflowV1Configured: true,
                canMutate: true,
                isReadOnly: false,
                canConfigureFieldBehavior: true,
            })
        ).toBe(true);
        expect(
            layoutFieldBehaviorControlsEnabled({
                entityType: "opportunity",
                workflowV1Configured: true,
                canMutate: true,
                isReadOnly: false,
                canConfigureFieldBehavior: false,
            })
        ).toBe(false);
        expect(
            layoutFieldBehaviorControlsEnabled({
                entityType: "job",
                workflowV1Configured: true,
                canMutate: true,
                isReadOnly: false,
                canConfigureFieldBehavior: true,
            })
        ).toBe(false);
        expect(
            layoutFieldBehaviorControlsEnabled({
                entityType: "opportunity",
                workflowV1Configured: false,
                canMutate: true,
                isReadOnly: false,
                canConfigureFieldBehavior: true,
            })
        ).toBe(false);
    });

    it("uses layout-specific control labels", () => {
        expect(LAYOUT_REQUIREMENT_CONTROL_LABEL).toContain("layout");
        expect(LAYOUT_INTERACTION_CONTROL_LABEL.toLowerCase()).toContain("editability");
        expect(LAYOUT_FIELD_BEHAVIOR_HELPER.toLowerCase()).toContain("drawer");
        expect(layoutRequirementPresetLabel("required_on_save")).toBe("Required to save");
    });

    it("reflects placement required_on_save override", () => {
        const view = buildLayoutFieldBehaviorView(
            {
                field_key: "campus_pref",
                is_system: false,
                is_required: false,
                requirement_policy: buildSimpleRequirementPolicy("optional"),
            },
            {
                field_placements_v1: [
                    {
                        field_key: "campus_pref",
                        surfaces: {
                            drawer_overview: {
                                requirement: buildSimpleRequirementPolicy("required_on_save"),
                            },
                        },
                    },
                ],
            }
        );
        expect(view.kind).toBe("editable");
        if (view.kind === "editable") {
            expect(view.requirementPreset).toBe("required_on_save");
            expect(view.requirementSource).toBe("placement");
        }
    });

    it("placement optional overrides definition required", () => {
        const view = buildLayoutFieldBehaviorView(
            {
                field_key: "campus_pref",
                is_system: false,
                is_required: true,
                requirement_policy: buildSimpleRequirementPolicy("required_on_save"),
            },
            {
                field_placements_v1: [
                    {
                        field_key: "campus_pref",
                        surfaces: {
                            drawer_overview: {
                                requirement: buildSimpleRequirementPolicy("optional"),
                            },
                        },
                    },
                ],
            }
        );
        expect(view.kind).toBe("editable");
        if (view.kind === "editable") {
            expect(view.requirementPreset).toBe("optional");
            expect(view.requirementSource).toBe("placement");
        }
    });

    it("falls back to definition when placements malformed", () => {
        const view = buildLayoutFieldBehaviorView(
            {
                field_key: "campus_pref",
                is_system: false,
                is_required: true,
                requirement_policy: buildSimpleRequirementPolicy("required_on_save"),
            },
            { field_placements_v1: [null, "x"] as unknown as [] }
        );
        expect(view.kind).toBe("editable");
        if (view.kind === "editable") {
            expect(view.requirementPreset).toBe("required_on_save");
            expect(view.requirementSource).toBe("definition");
        }
    });

    it("locks deferred status_key with explanation", () => {
        const view = buildLayoutFieldBehaviorView(
            { field_key: "status_key", is_system: true },
            null
        );
        expect(view.kind).toBe("locked");
        if (view.kind === "locked") {
            expect(view.lockReason.toLowerCase()).toContain("status");
        }
    });

    it("locks never_policy_controlled relationship fields", () => {
        const view = buildLayoutFieldBehaviorView(
            { field_key: "customer_id", is_system: true },
            null
        );
        expect(view.kind).toBe("locked");
    });
});
