import { describe, expect, it } from "vitest";
import {
    actionControlledFieldInteractionPolicy,
    hasValidWriteTarget,
    parseFieldInteractionPolicy,
    personFieldOnOpportunityInteractionPolicy,
    resolveFieldEditability,
    resolveFieldInteractionPolicy,
} from "@/lib/fields/fieldInteractionPolicy";

describe("fieldInteractionPolicy", () => {
    it("defaults legacy custom field to editable with direct write", () => {
        const r = resolveFieldEditability({
            field_key: "custom_a",
            entity_type: "opportunity",
            is_system: false,
        });
        expect(r.editable).toBe(true);
        expect(r.write_target?.behavior).toBe("direct");
    });

    it("system field defaults to system_controlled read-only", () => {
        const r = resolveFieldEditability({
            field_key: "created_at",
            entity_type: "opportunity",
            is_system: true,
        });
        expect(r.editable).toBe(false);
        expect(r.editability_mode).toBe("system_controlled");
    });

    it("related-record person name on opportunity resolves write target person", () => {
        const policy = personFieldOnOpportunityInteractionPolicy("first_name");
        const r = resolveFieldEditability(
            {
                field_key: "primary_person_first_name",
                entity_type: "opportunity",
                interaction_policy: policy,
            },
            { permission_keys: [] }
        );
        expect(r.editable).toBe(true);
        expect(r.write_target).toEqual({
            entity: "person",
            field: "first_name",
            behavior: "related_record",
        });
    });

    it("action-controlled tour date is not editable", () => {
        const policy = actionControlledFieldInteractionPolicy(
            "opportunity",
            "tour_date",
            "Controlled by tour scheduling workflow"
        );
        const r = resolveFieldEditability({
            field_key: "tour_date",
            entity_type: "opportunity",
            interaction_policy: policy,
        });
        expect(r.editable).toBe(false);
        expect(r.lock_reason).toContain("tour scheduling");
        expect(resolveFieldInteractionPolicy({ field_key: "tour_date", entity_type: "opportunity", interaction_policy: policy }).editability_mode).toBe(
            "action_controlled"
        );
    });

    it("flags missing write target when interaction_policy fails parse", () => {
        const bad = {
            field_key: "x",
            entity_type: "opportunity",
            interaction_policy: {
                version: 1,
                editability_mode: "editable",
                ownership: {
                    source_entity: "opportunity",
                    source_field: "x",
                    write_target_entity: "",
                    write_target_field: "",
                    write_behavior: "direct",
                },
            },
        };
        expect(parseFieldInteractionPolicy(bad.interaction_policy).ok).toBe(false);
        expect(hasValidWriteTarget(bad)).toBe(false);
    });
});
