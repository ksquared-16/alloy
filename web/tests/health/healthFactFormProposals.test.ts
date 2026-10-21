/**
 * A Form's allergy, condition and medication rows become HEALTH proposals — read in Health's own
 * words, never written by the adapter, and never given a severity the family did not choose.
 */
import { describe, expect, it } from "vitest";

import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import { classifyCollectionProvider } from "@/lib/fields/collection/canonicalCollectionProviderRegistry";
import { collectionBindingAuthoringEnabledForProvider } from "@/lib/fields/formsRelationshipOperationalSupport";
import { healthFactIdentityKey, healthSeverityFromAnswer, readHealthFactRow } from "@/lib/health/healthFactFormMembers";
import { validateFormSchema, type FormField } from "@/lib/forms/schema";

const allergyLines: FormField[] = [
    { id: "occ_allergy_allergen", type: "text", label: "What is your child allergic to?", required: true },
    { id: "occ_allergy_severity", type: "select", label: "How serious is it?", required: false, static_options: [{ value: "life_threatening", label: "Life-threatening" }, { value: "mild", label: "Mild" }] },
    { id: "occ_allergy_reaction", type: "text", label: "What happens (reaction)", required: false },
    { id: "occ_allergy_care_instructions", type: "text", label: "What should staff do?", required: false },
] as FormField[];

const schema = validateFormSchema({
    schema_version: 1,
    title: "TA-806",
    sections: [{ id: "s", field_ids: ["occ_allergy_list"] }],
    fields: [
        {
            id: "occ_allergy_list",
            type: "group",
            label: "Allergies",
            required: false,
            repeat: { min: 0, max: 6 },
            collection_binding: { collection_provider_ref: "health.allergies", iteration_entity_type: "person_health_fact", iteration_alias: "allergy" },
            fields: allergyLines,
        },
    ],
});

describe("health rows as Processing proposals", () => {
    it("the health collections are authorable and classify as health facts (immunizations are not)", () => {
        for (const ref of ["health.allergies", "health.conditions", "health.medications"]) {
            expect(collectionBindingAuthoringEnabledForProvider(ref)).toBe(true);
            expect(classifyCollectionProvider(ref)).toBe("health_fact");
        }
        expect(collectionBindingAuthoringEnabledForProvider("health.immunizations")).toBe(false);
        expect(classifyCollectionProvider("person.contact_role.physicians")).toBe("configured_relationship");
    });

    it("reads a row into the allergy payload Health defines — details stay attached to the allergy", () => {
        const r = readHealthFactRow("allergy", allergyLines, {
            occ_allergy_allergen: " Peanuts ",
            occ_allergy_severity: "life_threatening",
            occ_allergy_reaction: "Hives, swelling",
            occ_allergy_care_instructions: "EpiPen Jr. in backpack; call 911",
        });
        expect(r.payload).toEqual({ allergen: "Peanuts", severity: "life_threatening", reaction: "Hives, swelling", care_instructions: "EpiPen Jr. in backpack; call 911" });
        expect(r.missing_required).toEqual([]);
    });

    it("never invents a severity: an unknown answer is named and left out, an absent one stays absent", () => {
        expect(healthSeverityFromAnswer("Life-threatening")).toBe("life_threatening");
        expect(healthSeverityFromAnswer("kind of bad")).toBeNull();
        const r = readHealthFactRow("allergy", allergyLines, { occ_allergy_allergen: "Bees", occ_allergy_severity: "kind of bad" });
        expect(r.payload).toEqual({ allergen: "Bees" });
        expect(r.unrecognized_severity).toBe("kind of bad");
        expect(readHealthFactRow("allergy", allergyLines, { occ_allergy_allergen: "Dust" }).payload.severity).toBeUndefined();
    });

    it("a row with no allergen is incomplete, not a fact", () => {
        const r = readHealthFactRow("allergy", allergyLines, { occ_allergy_reaction: "Sneezing" });
        expect(r.missing_required).toEqual(["allergen"]);
    });

    it("the adapter carries the server-derived intent; nothing the client sends names a kind", () => {
        const bundle = adaptFormSubmissionToRelatedRecordProposals(
            schema,
            {
                values: {},
                groups: {
                    occ_allergy_list: [
                        { instance_key: "a1", values: { occ_allergy_allergen: "Peanuts", occ_allergy_severity: "life_threatening" }, collection: { provider_ref: "health.allergies", origin: "respondent_added", iteration_entity_type: "person_health_fact" } },
                        { instance_key: "a2", values: { occ_allergy_reaction: "Rash" }, collection: { provider_ref: "health.allergies", origin: "respondent_added", iteration_entity_type: "person_health_fact" } },
                    ],
                },
            },
            { formSubmissionId: "sub-h", formDefinitionVersionId: "ver-h" },
        );
        const [ok, incomplete] = bundle.collections[0]!.instances;
        expect(ok!.execution_kind).toBe("health_fact");
        expect(ok!.status).toBe("valid");
        expect(ok!.health_fact_intent).toMatchObject({ fact_kind: "allergy", payload: { allergen: "Peanuts", severity: "life_threatening" } });
        expect(ok!.relationship_intent).toBeUndefined();
        expect(incomplete!.status).toBe("incomplete");
        expect(incomplete!.health_fact_intent!.missing_required).toEqual(["allergen"]);
    });

    it("one allergen is one identity, whatever its spacing or case", () => {
        expect(healthFactIdentityKey("allergy", { allergen: " Peanuts " })).toBe(healthFactIdentityKey("allergy", { allergen: "peanuts" }));
        expect(healthFactIdentityKey("allergy", { allergen: "Peanuts" })).not.toBe(healthFactIdentityKey("allergy", { allergen: "Tree nuts" }));
        expect(healthFactIdentityKey("allergy", {})).toBeNull();
    });
});
