import { describe, expect, it } from "vitest";
import { buildOperatorFormView } from "@/lib/pos/formDraft/buildOperatorFormView";
import type { FormViewAddress, FormViewQuestion, FormViewRepeatGroup } from "@/lib/pos/formDraft/buildOperatorFormView";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

type Draft = Parameters<typeof buildOperatorFormView>[0];

const field = (over: Record<string, unknown>) =>
    ({ id: "f", label: "Field", type: "text", required: false, confidence: "high", ...over }) as never;

const draftOf = (over: Partial<Draft>): Draft =>
    ({ title: "Admissions Packet", generated_form_name: null, sections: [], fields: [], collections: [], ...over }) as Draft;

const firstItem = (v: ReturnType<typeof buildOperatorFormView>) => v.sections[0]!.items[0]!;

/* Narrow on the discriminant rather than casting, so a wrong item kind fails loudly and by name. */
function question(v: ReturnType<typeof buildOperatorFormView>): FormViewQuestion {
    const item = firstItem(v);
    if (item.kind !== "question") throw new Error(`expected a question, got ${item.kind}`);
    return item;
}
function group(v: ReturnType<typeof buildOperatorFormView>): FormViewRepeatGroup {
    const item = firstItem(v);
    if (item.kind !== "repeat_group") throw new Error(`expected a repeat group, got ${item.kind}`);
    return item;
}
function addressItem(v: ReturnType<typeof buildOperatorFormView>): FormViewAddress {
    const item = firstItem(v);
    if (item.kind !== "address") throw new Error(`expected an address, got ${item.kind}`);
    return item;
}
const addressLine = (id: string, label: string, key: string, over: Record<string, unknown> = {}) =>
    field({ id, label, field_source: { entity_type: "person", field_key: key }, ...over });

describe("what the operator is told about a destination", () => {
    it("says Alloy already knows it, in words, when the destination is certain", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "Child", field_ids: ["f"] } as never],
                fields: [field({ label: "Date of birth", type: "date", field_source: { entity_type: "customer_member", field_key: "date_of_birth" } })],
            }),
        );
        const q = question(v);
        expect(q).toMatchObject({ mapping: "known", answerShape: "Date", decisionPrompt: null });
        expect(q.mappingText).toBe("Alloy already knows this — Date of birth for the child.");
        expect(v.knownCount).toBe(1);
    });

    it("asks for confirmation rather than claiming knowledge when the engine was unsure", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["f"] } as never],
                fields: [field({ label: "Parent name", confidence: "low", field_source: { entity_type: "person", field_key: "full_name" } })],
            }),
        );
        expect(firstItem(v)).toMatchObject({ mapping: "suggested" });
        expect(question(v).mappingText).toContain("Alloy thinks this is");
    });

    it("red-lines a question it could not place, and says what to decide", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["f"] } as never],
                fields: [field({ label: "Mailing address", confidence: "low" })],
            }),
        );
        expect(firstItem(v)).toMatchObject({ mapping: "needs_review" });
        expect(v.needsReview).toEqual([{ id: "f", label: "Mailing address", prompt: "Who does this answer belong to?" }]);
    });

    it("treats a confident question with no destination as kept-with-the-form, not a problem", () => {
        const v = buildOperatorFormView(
            draftOf({ sections: [{ id: "s", title: "s", field_ids: ["f"] } as never], fields: [field({ label: "Anything else?" })] }),
        );
        expect(firstItem(v)).toMatchObject({ mapping: "form_only" });
        expect(v.needsReview).toEqual([]);
    });

    it("says a derived value is not asked at all", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["f"] } as never],
                fields: [field({ label: "Age", derived: { kind: "age_from_date_of_birth" } })],
            }),
        );
        expect(firstItem(v)).toMatchObject({ mapping: "derived" });
        expect(question(v).mappingText).toContain("not asked");
    });

    it("never leaks the engine's own vocabulary into anything an operator READS", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["a", "b", "c"] } as never],
                fields: [
                    field({ id: "a", label: "DOB", type: "date", field_source: { entity_type: "customer_member", field_key: "date_of_birth" } }),
                    field({ id: "b", label: "Mailing address", confidence: "low" }),
                    field({ id: "c", label: "Age", derived: { kind: "age_from_date_of_birth" } }),
                ],
                collections: [
                    { id: "g", label: "Parents / Guardians", observed_instance_count: 2, nested_fields: [] },
                ] as never,
            }),
        );
        /*
         * Collect only the strings a person actually sees. Asserting over the whole JSON would catch
         * property NAMES like `conditionConfidence`, which no operator reads, and would push the rule
         * towards renaming internals rather than writing better sentences.
         */
        const readable: string[] = [v.title, ...v.needsReview.flatMap((n) => [n.label, n.prompt])];
        for (const section of v.sections) {
            readable.push(section.title);
            for (const item of section.items) {
                if (item.kind === "prose") readable.push(item.text);
                else if (item.kind === "repeat_group") {
                    readable.push(item.label, item.addLabel, item.reuseText ?? "");
                } else if (item.kind === "address") {
                    readable.push(item.label, item.mappingText, item.decisionPrompt ?? "", ...item.lines.map((l) => l.label));
                } else {
                    readable.push(
                        item.label,
                        item.mappingText,
                        item.decisionPrompt ?? "",
                        item.answerShape,
                        item.requirednessText,
                        item.absenceText ?? "",
                    );
                }
            }
        }
        const prose = readable.join(" | ").toLowerCase();
        for (const leak of [
            "entity_type", "field_key", "owner_hint", "owner undecided", "collection_provider_ref",
            "customer_member", "requirement kind", "ambiguous grain", "confidence", "concept",
        ]) {
            expect(prose).not.toContain(leak.toLowerCase());
        }
    });
});

describe("conditional follow-ups", () => {
    const pair = (followUpLabel: string) =>
        buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "Health", field_ids: ["q", "d"] } as never],
                fields: [
                    field({ id: "q", label: "Does the child have allergies?", type: "boolean" }),
                    field({ id: "d", label: followUpLabel }),
                ],
            }),
        );

    it("nests an explicit 'If yes' but still only SUGGESTS it", () => {
        /*
         * Detection used to call an explicit "If yes" detected, which read as settled. Nothing the
         * importer notices is settled: a form must not hide a question until an operator has agreed to
         * hide it, so wording can only ever produce a suggestion. "accepted" comes off the draft.
         */
        const v = pair("If yes, please describe the allergies");
        expect(v.sections[0]!.items).toHaveLength(1);
        const q = question(v);
        expect(q.dependents).toHaveLength(1);
        expect(q.conditionConfidence).toBe("suggested");
        expect(q.conditionTriggerLabel).toBe("Yes");
    });

    it("marks a softer follow-up as suggested too", () => {
        expect(question(pair("Please describe")).conditionConfidence).toBe("suggested");
    });

    it("invents nothing after a question that is not yes/no", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["q", "d"] } as never],
                fields: [field({ id: "q", label: "Child name" }), field({ id: "d", label: "Please describe" })],
            }),
        );
        expect(v.sections[0]!.items).toHaveLength(2);
    });

    it("does not swallow an unrelated question that merely follows a yes/no", () => {
        const v = pair("Emergency contact phone");
        expect(v.sections[0]!.items).toHaveLength(2);
    });
});

describe("repeated people become one repeatable group", () => {
    const collections = [
        {
            id: "g1",
            label: "Parents / Guardians",
            observed_instance_count: 3,
            nested_fields: [
                { id: "n1", label: "Full name", type: "text", required: true, field_source: { entity_type: "person", field_key: "full_name" }, source_field_ids: ["p1", "p2", "p3"] },
            ],
        },
    ] as never as StoredFormDraftPreview["collections"];

    it("shows the group instead of Parent 1 / Parent 2 / Parent 3", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "Parents", field_ids: ["p1", "p2", "p3"] } as never],
                fields: [
                    field({ id: "p1", label: "Parent 1 First Name", suppressed_by_collection: "g1" }),
                    field({ id: "p2", label: "Parent 2 First Name", suppressed_by_collection: "g1" }),
                    field({ id: "p3", label: "Parent 3 First Name", suppressed_by_collection: "g1" }),
                ],
                collections,
            }),
        );
        expect(v.sections[0]!.items).toHaveLength(1);
        const g = group(v);
        expect(g.label).toBe("Parents / Guardians");
        expect(g.addLabel).toBe("Add parents / guardian");
        expect(g.reuseText).toContain("already knows");
        expect(g.observedInSource).toBe(3);
        // The replaced questions must not appear beside the group that replaced them.
        expect(JSON.stringify(v)).not.toContain("Parent 2 First Name");
    });

    it("still shows a group whose members never appeared in a section", () => {
        const v = buildOperatorFormView(draftOf({ sections: [], fields: [], collections }));
        expect(v.sections).toHaveLength(1);
        expect(firstItem(v).kind).toBe("repeat_group");
    });
});

describe("prose, signatures and source context", () => {
    it("renders text placed on the page but never asked as prose, not a question", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "Authorisations", field_ids: ["t"] } as never],
                fields: [field({ id: "t", label: "I authorise the school to...", read_only: true })],
            }),
        );
        expect(firstItem(v)).toMatchObject({ kind: "prose" });
        expect(v.questionCount).toBe(0);
    });

    it("keeps a section's static text as prose the family reads", () => {
        const v = buildOperatorFormView(
            draftOf({ sections: [{ id: "s", title: "Intro", field_ids: [], static_text: "Please read carefully." } as never], fields: [] }),
        );
        expect(firstItem(v)).toMatchObject({ kind: "prose", text: "Please read carefully." });
    });

    it("shows a signature as a signature", () => {
        const v = buildOperatorFormView(
            draftOf({ sections: [{ id: "s", title: "Sign", field_ids: ["s1"] } as never], fields: [field({ id: "s1", label: "Parent signature", type: "signature" })] }),
        );
        expect(firstItem(v)).toMatchObject({ answerShape: "Signature" });
    });

    it("carries the source excerpt, page and widget name so 'why is this here' is answerable", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["f"] } as never],
                fields: [field({ evidence: "  Child's date of birth  ", page: 2, pdf_field_name: "dob_1" })],
            }),
        );
        expect(question(v).source).toEqual({
            excerpt: "Child's date of birth",
            page: 2,
            sourceFieldName: "dob_1",
        });
    });

    it("prefers the operator's own form name over the document title", () => {
        const v = buildOperatorFormView(draftOf({ title: "scan_001.pdf", generated_form_name: "Admissions Packet" }), "scan_001.pdf");
        expect(v.title).toBe("Admissions Packet");
        expect(v.sourceDocumentName).toBe("scan_001.pdf");
    });
});

describe("an address is one thing, not five rows", () => {
    const homeLines = [
        addressLine("a1", "Home address line 1", "address_line1"),
        addressLine("a2", "Home address line 2", "address_line2"),
        addressLine("a3", "City", "city"),
        addressLine("a4", "State", "state"),
        addressLine("a5", "ZIP", "postal_code"),
    ];

    it("collapses consecutive postal lines into one concept with one mapping state", () => {
        const v = buildOperatorFormView(
            draftOf({ sections: [{ id: "s", title: "Where you live", field_ids: ["a1", "a2", "a3", "a4", "a5"] } as never], fields: homeLines }),
        );
        expect(v.sections[0]!.items).toHaveLength(1);
        const addr = addressItem(v);
        expect(addr.label).toBe("Home address");
        expect(addr.lines.map((l) => l.label)).toEqual(["Home address line 1", "Home address line 2", "City", "State", "ZIP"]);
        // One concept counts once, not five times.
        expect(v.questionCount).toBe(1);
    });

    it("starts a second address when a postal line repeats", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["a1", "a3", "m1", "m3"] } as never],
                fields: [
                    addressLine("a1", "Home address line 1", "address_line1"),
                    addressLine("a3", "City", "city"),
                    addressLine("m1", "Mailing address line 1", "address_line1"),
                    addressLine("m3", "City", "city"),
                ],
            }),
        );
        expect(v.sections[0]!.items).toHaveLength(2);
        expect(v.sections[0]!.items.map((i) => (i.kind === "address" ? i.label : i.kind))).toEqual([
            "Home address",
            "Mailing address",
        ]);
    });

    it("is required when any line is, and red-lines once when the owner is unknown", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["a1", "a3"] } as never],
                fields: [
                    field({ id: "a1", label: "Mailing address line 1", required: true, confidence: "low" }),
                    field({ id: "a3", label: "City", confidence: "low" }),
                ],
            }),
        );
        // No destination at all, so these are plain questions — the concept only forms from postal
        // destinations. This asserts the boundary rather than pretending it is an address.
        expect(v.sections[0]!.items.every((i) => i.kind === "question")).toBe(true);
    });

    it("leaves a lone postal line as an ordinary question", () => {
        const v = buildOperatorFormView(
            draftOf({ sections: [{ id: "s", title: "s", field_ids: ["a3"] } as never], fields: [addressLine("a3", "City", "city")] }),
        );
        expect(firstItem(v).kind).toBe("question");
    });
});

describe("requiredness and saying nothing", () => {
    it("states required or optional in words", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["r", "o"] } as never],
                fields: [field({ id: "r", label: "Date of birth", required: true }), field({ id: "o", label: "Allergies" })],
            }),
        );
        const [req, opt] = v.sections[0]!.items as FormViewQuestion[];
        expect(req!.requirednessText).toBe("Required");
        expect(opt!.requirednessText).toBe("Optional");
    });

    it("says what the family may answer when the source offered a nothing-to-report choice", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["f"] } as never],
                fields: [field({ label: "Allergies", options: ["No known allergies", "Peanuts"] })],
            }),
        );
        expect(question(v).absenceText).toBe("The family can answer \u201cNo known allergies\u201d.");
    });

    it("invents the affordance for nothing, when the source never offered one", () => {
        const v = buildOperatorFormView(
            draftOf({ sections: [{ id: "s", title: "s", field_ids: ["f"] } as never], fields: [field({ label: "Allergies", options: ["Peanuts", "Dairy"] })] }),
        );
        expect(question(v).absenceText).toBeNull();
    });

    it("does not offer it on a required question, which has no nothing-to-report answer", () => {
        const v = buildOperatorFormView(
            draftOf({ sections: [{ id: "s", title: "s", field_ids: ["f"] } as never], fields: [field({ label: "Allergies", required: true, options: ["None"] })] }),
        );
        expect(question(v).absenceText).toBeNull();
    });

    it("does not mistake a choice that merely starts with 'non' for saying nothing", () => {
        const v = buildOperatorFormView(
            draftOf({ sections: [{ id: "s", title: "s", field_ids: ["f"] } as never], fields: [field({ label: "Gender", options: ["Nonbinary", "Female"] })] }),
        );
        expect(question(v).absenceText).toBeNull();
    });
});

describe("accepted conditions versus suggestions", () => {
    it("reads an ACCEPTED condition off the draft and names its trigger", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["q", "d"] } as never],
                fields: [
                    field({ id: "q", label: "Does the child have allergies?", type: "boolean" }),
                    field({ id: "d", label: "Describe the allergies", visible_when: { field_id: "q", op: "eq", value: true } }),
                ],
            }),
        );
        const q = question(v);
        expect(q.conditionConfidence).toBe("accepted");
        expect(q.conditionTriggerLabel).toBe("Yes");
        expect(q.dependents).toHaveLength(1);
    });

    it("nests an accepted condition under the field it NAMES, not whatever precedes it", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["gate", "unrelated", "dep"] } as never],
                fields: [
                    field({ id: "gate", label: "Any siblings?", type: "boolean" }),
                    field({ id: "unrelated", label: "Favourite colour" }),
                    field({ id: "dep", label: "How many?", visible_when: { field_id: "gate", op: "eq", value: true } }),
                ],
            }),
        );
        const items = v.sections[0]!.items as FormViewQuestion[];
        expect(items).toHaveLength(2);
        expect(items[0]!.id).toBe("gate");
        expect(items[0]!.dependents.map((d) => d.id)).toEqual(["dep"]);
        expect(items[1]!.id).toBe("unrelated");
    });

    it("never calls a detected relationship accepted — detection only suggests", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "s", field_ids: ["q", "d"] } as never],
                fields: [
                    field({ id: "q", label: "Does the child have allergies?", type: "boolean" }),
                    field({ id: "d", label: "If yes, describe the allergies" }),
                ],
            }),
        );
        expect(question(v).conditionConfidence).toBe("suggested");
    });
});

describe("a grid the importer did not interpret", () => {
    it("warns on the section instead of drawing a table that was guessed", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [
                    {
                        id: "s",
                        title: "Immunization Summary",
                        static_text: "Vaccine | Dose 1 | Dose 2\nDTaP | 01/02 | 03/04\nMMR | 05/06 | 07/08",
                        field_ids: ["f"],
                    } as never,
                ],
                fields: [field({ label: "Parent signature", type: "signature" })],
            }),
        );
        expect(v.sections[0]!.tableWarning).toContain("Table needs review");
        expect(v.sections[0]!.tableWarning).toContain("rather than guessing its columns");
    });

    it("leaves ordinary instructions alone", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [
                    { id: "s", title: "Child", static_text: "Please complete every section in ink.", field_ids: ["f"] } as never,
                ],
                fields: [field({ label: "Student name" })],
            }),
        );
        expect(v.sections[0]!.tableWarning).toBeNull();
    });

    it("does not call a single delimited line a table", () => {
        const v = buildOperatorFormView(
            draftOf({
                sections: [{ id: "s", title: "Child", static_text: "Name | Date | Signature", field_ids: ["f"] } as never],
                fields: [field({ label: "Student name" })],
            }),
        );
        expect(v.sections[0]!.tableWarning).toBeNull();
    });
});
