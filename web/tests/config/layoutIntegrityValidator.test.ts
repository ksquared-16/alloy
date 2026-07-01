import { describe, expect, it } from "vitest";
import { validateLayoutIntegrity } from "@/lib/config/layoutIntegrityValidator";
import {
    actionControlledFieldInteractionPolicy,
    personFieldOnOpportunityInteractionPolicy,
} from "@/lib/fields/fieldInteractionPolicy";
import { buildSimpleRequirementPolicy } from "@/lib/fields/fieldPolicySettingsUi";

const BASE = "2026-01-01T00:00:00.000Z";

function report(input: Parameters<typeof validateLayoutIntegrity>[0]) {
    return validateLayoutIntegrity(input);
}

function codes(r: ReturnType<typeof validateLayoutIntegrity>) {
    return r.issues.map((i) => i.code);
}

describe("layoutIntegrityValidator", () => {
    it("passes clean minimal vendor layout", () => {
        const r = report({
            entity_type: "vendor",
            field_definitions: [
                {
                    field_key: "notes",
                    entity_type: "vendor",
                    field_type: "text",
                    is_required: false,
                    is_visible_in_drawer: true,
                    section_key: "custom",
                },
            ],
            sections: [{ section_key: "custom", entity_type: "vendor" }],
            layout_config_json: {},
        });
        expect(r.error_count).toBe(0);
        expect(codes(r).filter((c) => c === "required_field_not_visible")).toHaveLength(0);
    });

    it("detects required field not visible (definition default, no placement)", () => {
        const r = report({
            entity_type: "opportunity",
            field_definitions: [
                {
                    field_key: "hidden_required",
                    entity_type: "opportunity",
                    field_type: "text",
                    is_required: true,
                    requirement_policy: buildSimpleRequirementPolicy("required_on_save"),
                    is_visible_in_drawer: false,
                    is_visible_in_form: false,
                    is_visible_in_table: false,
                    section_key: "custom",
                },
            ],
            sections: [{ section_key: "custom", entity_type: "opportunity" }],
            layout_config_json: {},
        });
        expect(codes(r)).toContain("required_field_not_visible");
        expect(codes(r)).not.toContain("required_on_layout_not_visible");
    });

    it("placement required_on_save + missing from layout preview reports layout issue", () => {
        const r = report({
            entity_type: "opportunity",
            field_definitions: [
                {
                    field_key: "campus_pref",
                    entity_type: "opportunity",
                    field_type: "text",
                    is_required: false,
                    requirement_policy: buildSimpleRequirementPolicy("optional"),
                    is_visible_in_drawer: false,
                    is_visible_in_form: false,
                    section_key: "custom",
                },
            ],
            sections: [{ section_key: "custom", entity_type: "opportunity" }],
            layout_config_json: {
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
            },
        });
        const issue = r.issues.find((i) => i.field_key === "campus_pref");
        expect(issue?.code).toBe("required_on_layout_not_visible");
        expect(issue?.message).toContain("required on this layout");
    });

    it("placement optional overrides definition required — no required-missing issue", () => {
        const r = report({
            entity_type: "opportunity",
            field_definitions: [
                {
                    field_key: "campus_pref",
                    entity_type: "opportunity",
                    field_type: "text",
                    is_required: true,
                    requirement_policy: buildSimpleRequirementPolicy("required_on_save"),
                    is_visible_in_drawer: false,
                    is_visible_in_form: false,
                    section_key: "custom",
                },
            ],
            sections: [{ section_key: "custom", entity_type: "opportunity" }],
            layout_config_json: {
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
            },
        });
        expect(codes(r).filter((c) => c.startsWith("required_"))).toHaveLength(0);
    });

    it("malformed field_placements_v1 does not crash integrity", () => {
        const r = report({
            entity_type: "opportunity",
            field_definitions: [
                {
                    field_key: "hidden_required",
                    entity_type: "opportunity",
                    field_type: "text",
                    is_required: true,
                    requirement_policy: buildSimpleRequirementPolicy("required_on_save"),
                    is_visible_in_drawer: false,
                    is_visible_in_form: false,
                    section_key: "custom",
                },
            ],
            sections: [{ section_key: "custom", entity_type: "opportunity" }],
            layout_config_json: {
                field_placements_v1: [null, "bad", { field_key: 1 }] as unknown as [],
            },
        });
        expect(codes(r)).toContain("required_field_not_visible");
    });

    it("detects editable without write target", () => {
        const r = report({
            entity_type: "vendor",
            field_definitions: [
                {
                    field_key: "bad_write",
                    entity_type: "vendor",
                    field_type: "text",
                    is_visible_in_drawer: true,
                    interaction_policy: {
                        version: 1,
                        editability_mode: "editable",
                        ownership: {
                            source_entity: "vendor",
                            source_field: "bad_write",
                            write_target_entity: "",
                            write_target_field: "",
                            write_behavior: "direct",
                        },
                    },
                    section_key: "custom",
                },
            ],
            sections: [{ section_key: "custom", entity_type: "vendor" }],
            layout_config_json: {},
        });
        expect(codes(r)).toContain("editable_without_write_target");
    });

    it("accepts related-record person field with ownership", () => {
        const r = report({
            entity_type: "opportunity",
            field_definitions: [
                {
                    field_key: "person_first",
                    entity_type: "opportunity",
                    field_type: "text",
                    is_visible_in_drawer: true,
                    interaction_policy: personFieldOnOpportunityInteractionPolicy("first_name"),
                    section_key: "custom",
                },
            ],
            sections: [{ section_key: "custom", entity_type: "opportunity" }],
            layout_config_json: {},
        });
        expect(codes(r)).not.toContain("related_record_missing_ownership");
        expect(codes(r)).not.toContain("editable_without_write_target");
    });

    it("flags action_controlled with invalid write_behavior", () => {
        const policy = actionControlledFieldInteractionPolicy("opportunity", "tour_date", "workflow");
        const broken = {
            ...policy,
            ownership: { ...policy.ownership!, write_behavior: "direct" as const },
        };
        const r = report({
            entity_type: "opportunity",
            field_definitions: [
                {
                    field_key: "tour_date",
                    entity_type: "opportunity",
                    field_type: "date",
                    is_visible_in_drawer: true,
                    interaction_policy: broken,
                    section_key: "custom",
                },
            ],
            sections: [{ section_key: "custom", entity_type: "opportunity" }],
            layout_config_json: {},
        });
        expect(codes(r)).toContain("action_controlled_incorrectly_editable");
    });

    it("detects empty section and invalid section reference", () => {
        const r = report({
            entity_type: "job",
            field_definitions: [
                {
                    field_key: "orphan",
                    entity_type: "job",
                    field_type: "text",
                    is_visible_in_drawer: true,
                    section_key: "missing_section",
                },
            ],
            sections: [{ section_key: "empty_sec", entity_type: "job" }],
            layout_config_json: {},
        });
        expect(codes(r)).toContain("empty_section");
        expect(codes(r)).toContain("invalid_section_reference");
    });

    it("detects option field with no active options", () => {
        const r = report({
            entity_type: "opportunity",
            field_definitions: [
                {
                    field_key: "tier",
                    entity_type: "opportunity",
                    field_type: "select",
                    is_visible_in_drawer: true,
                    config: { option_set_key: "subsidy_tier" },
                    section_key: "custom",
                },
            ],
            sections: [{ section_key: "custom", entity_type: "opportunity" }],
            layout_config_json: {},
            option_sets: [{ set_key: "subsidy_tier", active_item_count: 0 }],
        });
        expect(codes(r)).toContain("option_field_no_active_options");
    });

    it("detects layout ordering duplicate keys", () => {
        const r = report({
            entity_type: "opportunity",
            field_definitions: [],
            sections: [],
            layout_config_json: { overview_section_order: ["a", "a", "b"] },
        });
        expect(codes(r)).toContain("layout_ordering_conflict");
    });

    it("produces deterministic issue ordering", () => {
        const input = {
            entity_type: "opportunity",
            field_definitions: [
                {
                    field_key: "z_field",
                    entity_type: "opportunity",
                    field_type: "text",
                    is_required: true,
                    is_visible_in_drawer: false,
                    section_key: "custom",
                },
                {
                    field_key: "a_field",
                    entity_type: "opportunity",
                    field_type: "select",
                    is_visible_in_drawer: true,
                    config: { option_set_key: "empty_set" },
                    section_key: "custom",
                },
            ],
            sections: [{ section_key: "custom", entity_type: "opportunity" }],
            layout_config_json: {},
            option_sets: [{ set_key: "empty_set", active_item_count: 0 }],
        };
        const r1 = report(input);
        const r2 = report(input);
        expect(r1.issues.map((i) => `${i.severity}:${i.code}:${i.field_key ?? ""}`)).toEqual(
            r2.issues.map((i) => `${i.severity}:${i.code}:${i.field_key ?? ""}`)
        );
    });

    it("stamps stable checked_at in validateLayoutIntegrity for tests", () => {
        const r = report({
            entity_type: "person",
            field_definitions: [
                {
                    field_key: "email",
                    entity_type: "person",
                    field_type: "email",
                    is_visible_in_drawer: true,
                    section_key: "contact",
                },
            ],
            sections: [{ section_key: "contact", entity_type: "person" }],
            layout_config_json: null,
        });
        expect(r.checked_at_iso).toBe(new Date(0).toISOString());
        expect(r.version).toBe(1);
        void BASE;
    });
});
