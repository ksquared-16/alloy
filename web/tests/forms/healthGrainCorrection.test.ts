/**
 * M1 — durable child-health truth is CHILD grain (D-H1).
 *
 * `allergy_notes` was registered at `enrollment` grain, which says an allergy is a fact about an
 * admission. It is a fact about a child and outlives every admission.
 *
 * The correction had to be additive, reversible and lossless, so this asserts all three: the
 * canonical destination is child-grain, the legacy row still resolves, and the two share ONE
 * ask-once identity so a packet asking at either grain collects the value once.
 */

import { describe, expect, it } from "vitest";
import {
    OPERATIONAL_FORM_SYSTEM_FIELDS,
    type SystemFieldRegistryEntry,
} from "@/lib/forms/systemFieldRegistry";
import { deriveFieldSources, inferQuestionIntent } from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import { PROCESSING_BUILDER_CANONICAL_FIELDS } from "@/lib/forms/processingFormBuilderLibrary";
import { canonicalKeyFor } from "@/lib/pos/packet/packetFieldPlan";

const byId = (id: string): SystemFieldRegistryEntry | undefined => OPERATIONAL_FORM_SYSTEM_FIELDS.find((f) => f.id === id);

describe("the canonical destination is child grain", () => {
    it("registers allergies on the child", () => {
        const child = byId("child_allergies")!;
        expect(child.entity_type).toBe("child");
        expect(child.field_key).toBe("allergies");
        expect(child.crm_mapping_key).toBe("child.allergies");
        expect(child.deprecated).toBeUndefined();
    });

    it("binds a health question to the child, not to the enrollment", () => {
        const source = deriveFieldSources({
            subject: "enrollment",
            intent: inferQuestionIntent("Allergies"),
            displayLabel: "Allergies",
            type: "text",
        });
        expect(source?.entity_type).toBe("child");
        expect(source?.field_key).toBe("allergies");
    });

    it("offers only the child-grain destination for a NEW binding", () => {
        const medical = PROCESSING_BUILDER_CANONICAL_FIELDS.filter((f) => f.group === "medical");
        expect(medical.map((f) => f.registryId)).toEqual(["child_allergies"]);
    });
});

describe("nothing is lost and nothing is deleted", () => {
    it("keeps the legacy enrollment row resolvable", () => {
        const legacy = byId("allergy_notes")!;
        expect(legacy, "the legacy row must not be deleted").toBeTruthy();
        expect(legacy.entity_type).toBe("enrollment");
        expect(legacy.deprecated).toBe(true);
        expect(legacy.superseded_by).toBe("child_allergies");
    });

    it("gives both grains ONE ask-once identity, so a value is collected once and reaches both", () => {
        const child = byId("child_allergies")!;
        const legacy = byId("allergy_notes")!;
        expect(legacy.shared_value_key).toBe(child.shared_value_key);

        // The packet planner dedupes on shared_value_key FIRST — that is the mechanism.
        const asField = (entry: SystemFieldRegistryEntry) =>
            ({
                id: entry.id,
                type: "text" as const,
                label: entry.default_label,
                required: false,
                field_source: {
                    entity_type: entry.entity_type,
                    field_key: entry.field_key,
                    shared_value_key: entry.shared_value_key,
                },
            });
        expect(canonicalKeyFor(asField(child)).key).toBe(canonicalKeyFor(asField(legacy)).key);
        expect(canonicalKeyFor(asField(child)).basis).toBe("shared_alias");
    });

    it("is reversible — the change is registry rows, not stored data", () => {
        // Published forms carry the field_source they were stamped with; the registry decides what
        // NEW bindings get. Reverting is deleting the child row and clearing the deprecation.
        const child = byId("child_allergies")!;
        expect(child.shared_value_key).toBe("child_allergies");
        expect(byId("allergy_notes")!.crm_mapping_key).toBe("health.allergy_notes");
    });
});

describe("medication_flag is legacy and does NOT become the new truth", () => {
    it("stays deprecated with no child-grain replacement", () => {
        const flag = byId("medication_flag")!;
        expect(flag.deprecated).toBe(true);
        expect(flag.superseded_by).toBeUndefined();
        // Medication is a Health-foundation kind (D-H5). Enrollment must not create a destination.
        expect(OPERATIONAL_FORM_SYSTEM_FIELDS.some((f) => f.field_key === "medications")).toBe(false);
        expect(OPERATIONAL_FORM_SYSTEM_FIELDS.some((f) => f.field_key === "medication")).toBe(false);
    });

    it("is not offered for a new binding", () => {
        expect(PROCESSING_BUILDER_CANONICAL_FIELDS.some((f) => f.registryId === "medication_flag")).toBe(false);
    });
});

describe("Enrollment creates no competing Health destination", () => {
    it("registers no allergy, condition, medication or immunization COLLECTION vocabulary", () => {
        const keys = OPERATIONAL_FORM_SYSTEM_FIELDS.map((f) => f.field_key);
        // The single child-grain `allergies` note is the pre-existing field the contract cleared.
        // What must not appear is a competing structured destination for the Health kinds.
        expect(keys.filter((k) => /^(conditions?|immunizations?|medications?)$/.test(k))).toEqual([]);
    });
});
