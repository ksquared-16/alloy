import { describe, expect, it } from "vitest";
import {
    legacyIsRequiredFromEffective,
    resolveEffectiveFieldBehavior,
} from "@/lib/fields/resolveEffectiveFieldBehavior";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

const customFieldDef = {
    field_key: "custom_notes",
    entity_type: "opportunity",
    is_system: false,
    is_required: false,
    requirement_policy: null,
    interaction_policy: null,
};

describe("resolveEffectiveFieldBehavior", () => {
    it("uses placement requirement over definition default", () => {
        const layout: RecordLayoutConfigJson = {
            field_placements_v1: [
                {
                    field_key: "custom_notes",
                    surfaces: {
                        drawer_overview: {
                            requirement: { version: 1, mode: "required_on_save", validation_scope: "save" },
                        },
                    },
                },
            ],
        };
        const def = {
            ...customFieldDef,
            requirement_policy: { version: 1, mode: "optional" },
        };
        const effective = resolveEffectiveFieldBehavior({
            entityType: "opportunity",
            fieldDef: def,
            layoutConfig: layout,
        });
        expect(effective?.requirement.mode).toBe("required_on_save");
        expect(effective?.requirement_source).toBe("placement");
        expect(effective?.interaction_source).toBe("definition");
    });

    it("falls back to definition when no placement", () => {
        const def = {
            ...customFieldDef,
            is_required: true,
        };
        const effective = resolveEffectiveFieldBehavior({
            entityType: "opportunity",
            fieldDef: def,
            layoutConfig: {},
        });
        expect(effective?.requirement.mode).toBe("required");
        expect(effective?.requirement_source).toBe("definition");
        expect(effective?.interaction_source).toBe("definition");
        expect(effective?.interaction.editability_mode).toBe("editable");
    });

    it("applies system preset caps for non-enforceable status field", () => {
        const def = {
            field_key: "status_key",
            entity_type: "opportunity",
            is_system: true,
            is_required: true,
            requirement_policy: { version: 1, mode: "required" },
            interaction_policy: null,
        };
        const effective = resolveEffectiveFieldBehavior({
            entityType: "opportunity",
            fieldDef: def,
            layoutConfig: null,
        });
        expect(effective?.requirement.mode).toBe("optional");
        expect(effective?.requirement_source).toBe("preset");
        expect(effective?.interaction.editability_mode).toBe("system_controlled");
        expect(effective?.interaction_source).toBe("preset");
    });

    it("ignores malformed placement JSON and uses definition", () => {
        const layout = {
            field_placements_v1: "not-an-array",
        } as unknown as RecordLayoutConfigJson;
        const def = {
            ...customFieldDef,
            is_required: true,
        };
        const effective = resolveEffectiveFieldBehavior({
            entityType: "opportunity",
            fieldDef: def,
            layoutConfig: layout,
        });
        expect(effective?.requirement.mode).toBe("required");
        expect(effective?.requirement_source).toBe("definition");
    });

    it("ignores invalid placement row and uses definition", () => {
        const layout: RecordLayoutConfigJson = {
            field_placements_v1: [{ field_key: "custom_notes", surfaces: { drawer_overview: {} } }],
        };
        const def = {
            ...customFieldDef,
            is_required: true,
        };
        const effective = resolveEffectiveFieldBehavior({
            entityType: "opportunity",
            fieldDef: def,
            layoutConfig: layout,
        });
        expect(effective?.requirement.mode).toBe("required");
        expect(effective?.requirement_source).toBe("definition");
    });

    it("reports placement source for interaction override", () => {
        const layout: RecordLayoutConfigJson = {
            field_placements_v1: [
                {
                    field_key: "custom_notes",
                    surfaces: {
                        drawer_overview: {
                            interaction: {
                                version: 1,
                                editability_mode: "read_only",
                                ownership: {
                                    source_entity: "opportunity",
                                    source_field: "custom_notes",
                                    write_target_entity: "opportunity",
                                    write_target_field: "custom_notes",
                                    write_behavior: "none",
                                    lock_reason: "read_only_policy",
                                },
                            },
                        },
                    },
                },
            ],
        };
        const effective = resolveEffectiveFieldBehavior({
            entityType: "opportunity",
            fieldDef: customFieldDef,
            layoutConfig: layout,
        });
        expect(effective?.interaction.editability_mode).toBe("read_only");
        expect(effective?.interaction_source).toBe("placement");
    });

    it("legacyIsRequiredFromEffective reflects effective requirement", () => {
        const effective = resolveEffectiveFieldBehavior({
            entityType: "opportunity",
            fieldDef: { ...customFieldDef, is_required: false },
            layoutConfig: {
                field_placements_v1: [
                    {
                        field_key: "custom_notes",
                        surfaces: {
                            drawer_overview: {
                                requirement: { version: 1, mode: "required" },
                            },
                        },
                    },
                ],
            },
        });
        expect(effective).not.toBeNull();
        expect(legacyIsRequiredFromEffective(effective!)).toBe(true);
    });

    it("returns null for unsupported entity type", () => {
        expect(
            resolveEffectiveFieldBehavior({
                entityType: "customer",
                fieldDef: customFieldDef,
            })
        ).toBeNull();
    });

    it("does not throw on null layout config", () => {
        expect(() =>
            resolveEffectiveFieldBehavior({
                entityType: "opportunity",
                fieldDef: customFieldDef,
                layoutConfig: null,
            })
        ).not.toThrow();
    });
});
