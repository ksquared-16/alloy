/**
 * THE OBJECTIVE IS ASSEMBLED MORE THAN ONCE, AND EVERY READING MUST AGREE.
 *
 * Found in the mounted conversation, under a published governing revision: "Child gender" reached a
 * parent as *"This question offers a set of answers your school maintains, and that list could not
 * be loaded. Nobody can answer it until it is available."* — for `person_gender`, which was
 * present and had three items.
 *
 * The fail-closed path was doing its job. What was wrong is that the vocabulary never arrived.
 * `resolveEnrollmentInformationNeeds` resolves the option sets and assembles once, but
 * `resolveParticipantEnrollmentObjective` RE-ASSEMBLES from the captured context with the
 * party-role vocabulary in hand, and the post-write recompute assembles from the context alone.
 * Passing the sets only as a function input meant the first pass had them and the authoritative
 * later passes did not.
 *
 * This is the same hazard the `knownPartyEntries` comment in that resolver already records — "two
 * readings of the same objective disagreeing about who exists" — reached by a different fact. The
 * sets now ride the context, which is what makes the readings agree.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assembleEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/resolveEnrollmentInformationNeeds";
import type { EnrollmentNeedsContext } from "@/lib/enrollment/informationNeeds/resolveEnrollmentInformationNeeds";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const PERSON_GENDER = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "not_specified", label: "Not Specified" },
];

const schema = {
    schema_version: 1,
    title: "ZZ CERT Capability Specimen",
    sections: [{ id: "s1", title: "Section 1", field_ids: ["gender"] }],
    fields: [{ id: "gender", type: "select", label: "Child gender", required: false, option_set_key: "person_gender" }],
} as unknown as FormSchemaV1;

function context(withSets: boolean): EnrollmentNeedsContext {
    return {
        prog: { process_instance_id: "pi", session_id: "s", business_process_revision_id: "rev", stage_key: "enrolling" },
        session: { id: "s", shared_values: {}, metadata: {} },
        subjectId: "child-1",
        forms: [
            {
                requirement_id: "enrollment_packet",
                form_definition_id: "form-1",
                form_definition_version_id: "ver-1",
                session_item_id: "item-1",
                schema,
                pdfMapping: null,
            },
        ],
        ...(withSets ? { optionSets: { person_gender: PERSON_GENDER } } : {}),
    } as unknown as EnrollmentNeedsContext;
}

const genderOccurrence = (ctx: EnrollmentNeedsContext, input: Record<string, unknown> = {}) => {
    const value = assembleEnrollmentInformationNeeds(ctx, input as never);
    return value.needs.flatMap((n) => n.occurrences).find((o) => o.form_field_id === "gender") ?? null;
};

describe("a re-assembly from the context alone keeps the vocabulary", () => {
    it("resolves the choices with no input at all — which is how the recompute calls it", () => {
        const occ = genderOccurrence(context(true));
        expect(occ?.options.map((o) => o.label)).toEqual(["Male", "Female", "Not Specified"]);
        expect(occ?.vocabulary_unresolved).toBeUndefined();
    });

    it("the defect, stated: without the context the same call fails the question closed", () => {
        const occ = genderOccurrence(context(false));
        expect(occ?.options).toEqual([]);
        expect(occ?.vocabulary_unresolved).toBe(true);
    });

    it("an explicit input still wins, so a caller can override", () => {
        const occ = genderOccurrence(context(false), { optionSets: { person_gender: PERSON_GENDER } });
        expect(occ?.options.map((o) => o.value)).toEqual(["male", "female", "not_specified"]);
    });
});

describe("the resolver puts them where every reading can find them", () => {
    const RESOLVER = "lib/enrollment/informationNeeds/resolveEnrollmentInformationNeeds.ts";

    it("the captured context carries the resolved sets", () => {
        const src = read(RESOLVER);
        // The context handed to `captureContext` is the one the objective re-assembles from.
        expect(src).toMatch(/const context: EnrollmentNeedsContext = \{ prog, session, subjectId, forms, optionSets \};/);
        expect(src).toContain("input.captureContext?.(context)");
    });

    it("and the context is consulted when no input is given", () => {
        expect(read(RESOLVER)).toContain("input.optionSets ?? context.optionSets");
    });

    it("the vocabularies are still resolved once, through the canonical authority", () => {
        const src = read(RESOLVER);
        expect(src).toMatch(/await resolveOptionSetsForOrg\(\s*supabase,\s*input\.orgId,/);
    });
});
