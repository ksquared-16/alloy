import { describe, expect, it } from "vitest";
import {
    canonicalRefKey,
    canonicalRefToRuleId,
    canonicalRefToSystemFieldId,
    layoutRefKeyToCanonicalRef,
    legacyIdToCanonicalRef,
    resolveRuleIdForCanonicalRef,
    ruleIdToCanonicalRef,
    systemFieldIdToCanonicalRef,
} from "@/lib/fields/fieldRegistryReferenceMatrix";

describe("fieldRegistryReferenceMatrix", () => {
    it("maps BP rule_id person:first_name to person/first_name", () => {
        expect(ruleIdToCanonicalRef("person:first_name")).toEqual({
            entity_type: "person",
            field_key: "first_name",
        });
        expect(canonicalRefToRuleId({ entity_type: "person", field_key: "first_name" })).toBe("person:first_name");
    });

    it("maps Forms guardian_first_name to person/first_name", () => {
        expect(systemFieldIdToCanonicalRef("guardian_first_name")).toEqual({
            entity_type: "person",
            field_key: "first_name",
        });
        expect(canonicalRefToSystemFieldId({ entity_type: "person", field_key: "first_name" })).toBe(
            "guardian_first_name"
        );
    });

    it("maps child:program_interest and desired_program_type to inquiry_child/desired_program_type", () => {
        expect(ruleIdToCanonicalRef("child:program_interest")).toEqual({
            entity_type: "inquiry_child",
            field_key: "desired_program_type",
        });
        expect(systemFieldIdToCanonicalRef("desired_program_type")).toEqual({
            entity_type: "inquiry_child",
            field_key: "desired_program_type",
        });
        expect(
            legacyIdToCanonicalRef("child:program_interest", "lifecycle_rule_id")?.field_key
        ).toBe("desired_program_type");
    });

    it("maps layout inquiry_child refKey to canonical registry ref", () => {
        expect(layoutRefKeyToCanonicalRef("inquiry_child.desired_start_date")).toEqual({
            entity_type: "inquiry_child",
            field_key: "desired_start_date",
        });
    });

    it("resolves custom rule_id for org-only registry fields", () => {
        const ref = { entity_type: "inquiry_child", field_key: "preferred_start_month" };
        expect(resolveRuleIdForCanonicalRef(ref)).toBe("custom:child:preferred_start_month");
        expect(ruleIdToCanonicalRef("custom:child:preferred_start_month")).toEqual(ref);
        expect(canonicalRefKey(ref)).toBe("inquiry_child:preferred_start_month");
    });
});
