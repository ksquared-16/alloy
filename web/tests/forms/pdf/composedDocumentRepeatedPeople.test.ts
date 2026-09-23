/**
 * THE COMPLETED PAPERWORK MUST NAME THE PEOPLE.
 *
 * Human QA, Disposable0913 family: the participant flow was right, the submission succeeded, and
 * the generated document read
 *
 *     YOUR FAMILY
 *     Children in your household   —
 *     Emergency contacts           —
 *
 * A repeating group's answers live in `groups[groupId]`; the composer read only `values`, where a
 * group id can never appear. So every family's repeated people reached the school as a heading and
 * an em dash — for the one document that IS the school's evidence of who may collect their child.
 *
 * These read the bytes back. A test that asserted on the composer's return value would have passed
 * throughout the defect.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { composeGeneratedDocument } from "@/lib/forms/pdf/generation/generatedDocumentComposer";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayloadGroupRow } from "@/lib/forms/validateSubmission";
import { composedDocumentLines, composedDocumentText } from "./composedDocumentText";

const schema = {
    title: "Enrollment Application",
    fields: [
        { id: "child_name", type: "text", label: "Child's full name" },
        {
            id: "siblings",
            type: "group",
            label: "Children in your household",
            repeat: { min: 0, max: null },
            party_collection: { action_key: "add_child", subject: "child", show_known: true, allow_add: true },
            fields: [
                { id: "sib_name", type: "text", label: "Child's name" },
                { id: "sib_dob", type: "date", label: "Date of birth" },
            ],
        },
        {
            id: "emergency_contacts",
            type: "group",
            label: "Emergency contacts",
            repeat: { min: 1, max: null },
            party_collection: {
                action_key: "add_person",
                subject: "person",
                role: "emergency_contact",
                show_known: true,
                allow_add: true,
            },
            fields: [
                { id: "ec_name", type: "text", label: "Full name", required: true },
                { id: "ec_phone", type: "text", label: "Phone", required: true },
                { id: "ec_rel", type: "text", label: "Relationship to the child" },
            ],
        },
    ],
    sections: [{ id: "s1", title: "Your family", field_ids: ["child_name", "siblings", "emergency_contacts"] }],
} as unknown as FormSchemaV1;

const provenance = {
    form_definition_id: "3f682c60-6e7c-4b41-a3cb-64f35c1a6d94",
    form_definition_version_id: "b7be55c5-15fd-44bc-8b68-1938b4e1532d",
    source_document_id: null,
    source_sha256: null,
    source_title: null,
};

function row(
    instance_key: string,
    values: Record<string, unknown>,
    origin: "existing" | "respondent_added",
    item_id?: string,
): FormPayloadGroupRow {
    return {
        instance_key,
        values,
        groups: {},
        signatures: {},
        collection: {
            provider_ref: "party:add_person",
            origin,
            iteration_entity_type: "person",
            ...(item_id ? { item_id } : {}),
        },
    } as unknown as FormPayloadGroupRow;
}

/** The exact human-QA specimen: one known sibling, one added child, one known and one added contact. */
const QA_GROUPS = {
    siblings: [
        row("known:9c6", { sib_name: "Bea Disposable0913" }, "existing", "9c6ba9a5-0000-4000-8000-000000000001"),
        row("e-2", { sib_name: "Dax Disposable0913", sib_dob: "2019-04-02" }, "respondent_added"),
    ],
    emergency_contacts: [
        row(
            "known:c0r",
            { ec_name: "Corinne Vasquez", ec_phone: "+15415557788", ec_rel: "Grandmother" },
            "existing",
            "c0r1nne0-0000-4000-8000-000000000002",
        ),
        row("e-9", { ec_name: "Farrah Nolan", ec_phone: "3213525132", ec_rel: "Neighbour" }, "respondent_added"),
    ],
} as const;

async function composeQa() {
    return composeGeneratedDocument({
        schema,
        values: { child_name: "Touree Disposable0913" },
        groups: QA_GROUPS as unknown as Record<string, readonly FormPayloadGroupRow[]>,
        provenance,
    });
}

describe("repeated group rows reach the generated document", () => {
    it("prints the people, not just the heading", async () => {
        const text = composedDocumentText((await composeQa()).bytes);
        expect(text).toContain("Children in your household");
        expect(text).toContain("Emergency contacts");
        for (const name of ["Bea Disposable0913", "Dax Disposable0913", "Corinne Vasquez", "Farrah Nolan"]) {
            expect(text, `${name} is missing from the completed paperwork`).toContain(name);
        }
    });

    it("includes the people Alloy already knew — reuse is not erasure", async () => {
        const text = composedDocumentText((await composeQa()).bytes);
        // Known entries carry `origin: existing`; they are still evidence the family confirmed.
        expect(text).toContain("Bea Disposable0913");
        expect(text).toContain("Corinne Vasquez");
    });

    it("includes the people the family added", async () => {
        const text = composedDocumentText((await composeQa()).bytes);
        expect(text).toContain("Dax Disposable0913");
        expect(text).toContain("Farrah Nolan");
    });

    it("omits a row the family removed", async () => {
        const kept = {
            ...QA_GROUPS,
            emergency_contacts: [QA_GROUPS.emergency_contacts[0], QA_GROUPS.emergency_contacts[1]].slice(0, 2),
        };
        const removed = {
            ...QA_GROUPS,
            // The family took Farrah off this form: the row is simply not in the payload.
            emergency_contacts: [QA_GROUPS.emergency_contacts[0]],
        };
        const withFarrah = composedDocumentText(
            (
                await composeGeneratedDocument({
                    schema,
                    values: {},
                    groups: kept as unknown as Record<string, readonly FormPayloadGroupRow[]>,
                    provenance,
                })
            ).bytes,
        );
        const withoutFarrah = composedDocumentText(
            (
                await composeGeneratedDocument({
                    schema,
                    values: {},
                    groups: removed as unknown as Record<string, readonly FormPayloadGroupRow[]>,
                    provenance,
                })
            ).bytes,
        );
        expect(withFarrah).toContain("Farrah Nolan");
        expect(withoutFarrah).not.toContain("Farrah Nolan");
        expect(withoutFarrah, "removing one person must not remove the others").toContain("Corinne Vasquez");
    });

    it("renders multiple rows as distinct entries with their own details", async () => {
        const lines = composedDocumentLines((await composeQa()).bytes);
        const corinne = lines.indexOf("Corinne Vasquez");
        const farrah = lines.indexOf("Farrah Nolan");
        expect(corinne).toBeGreaterThan(-1);
        expect(farrah).toBeGreaterThan(corinne);
        // Each person's own details sit under their own name, not pooled under the heading.
        expect(lines.slice(corinne, farrah).join("\n")).toContain("Grandmother");
        expect(lines.slice(farrah).join("\n")).toContain("Neighbour");
    });

    it("never reduces a populated collection to a dash", async () => {
        const lines = composedDocumentLines((await composeQa()).bytes);
        const heading = lines.indexOf("Emergency contacts");
        expect(heading).toBeGreaterThan(-1);
        /*
         * `-`, not `—`: the composer folds an em dash to ASCII so the standard fonts can draw it,
         * so asserting on the em dash would be asserting on a character the document never holds.
         */
        expect(lines[heading + 1], "a populated collection printed as an empty answer").not.toBe("-");
        expect(lines[heading + 1]).toBe("Corinne Vasquez");
    });

    it("says so in words when a collection really is empty", async () => {
        const lines = composedDocumentLines(
            (await composeGeneratedDocument({ schema, values: {}, groups: {}, provenance })).bytes,
        );
        const heading = lines.indexOf("Emergency contacts");
        expect(heading).toBeGreaterThan(-1);
        expect(lines[heading + 1]).toBe("None provided.");
        expect(lines[heading + 1]).not.toBe("-");
    });

    it("prints no internal identity on the family's document", async () => {
        const text = composedDocumentText((await composeQa()).bytes);
        for (const leak of ["instance_key", "known:9c6", "e-9", "respondent_added", "existing", "party:add_person", "9c6ba9a5"]) {
            expect(text, `${leak} reached a participant-facing document`).not.toContain(leak);
        }
    });

    it("formats a phone number on the artifact, whichever shape it was stored in", async () => {
        const text = composedDocumentText((await composeQa()).bytes);
        // Corinne's canonical E.164 and Farrah's typed digits read identically on paper.
        expect(text).toContain("(541) 555-7788");
        expect(text).toContain("(321) 352-5132");
        expect(text).not.toContain("+15415557788");
        expect(text).not.toContain("3213525132");
    });
});

describe("the artifact the organisation keeps carries the same people", () => {
    /*
     * The live render and the FILED copy are two calls to one composer, and repairing only the
     * first is the worse outcome of the two: the parent is shown a document naming four people and
     * signs it, and the copy kept as the school's evidence names none of them.
     *
     * `persistSignedEnrollmentArtifact` composes from the SUBMITTED payload — convergence, known
     * reuse and removal have all happened upstream — so it must hand the composer that payload's
     * `groups`, not only its `values`.
     */
    const src = readFileSync(
        new URL("../../../lib/forms/pdf/persistSignedEnrollmentArtifact.ts", import.meta.url).pathname,
        "utf8",
    );

    it("hands the submitted rows to the composer", () => {
        const at = src.indexOf("await composeGeneratedDocument({");
        expect(at).toBeGreaterThan(0);
        const call = src.slice(at, at + 1600);
        expect(call, "the filed artifact is composed from values alone").toContain("payload?.groups");
    });

    it("reads them from the submission, never re-derived at filing time", () => {
        const at = src.indexOf("await composeGeneratedDocument({");
        const call = src.slice(at, at + 1600);
        expect(call).toContain("input.sub.payload?.groups");
        expect(call).not.toContain("partyCollectionGroupRows");
    });
});
