import { describe, expect, it } from "vitest";
import { buildOperatorFormView } from "@/lib/pos/formDraft/buildOperatorFormView";
import type { FormViewQuestion, FormViewRepeatGroup } from "@/lib/pos/formDraft/buildOperatorFormView";
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
                } else {
                    readable.push(item.label, item.mappingText, item.decisionPrompt ?? "", item.answerShape);
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

    it("nests an explicit 'If yes' under the question it depends on", () => {
        const v = pair("If yes, please describe the allergies");
        expect(v.sections[0]!.items).toHaveLength(1);
        const q = question(v);
        expect(q.dependents).toHaveLength(1);
        expect(q.conditionConfidence).toBe("detected");
        expect(q.conditionTriggerLabel).toBe("Yes");
    });

    it("marks a softer follow-up as suggested so the operator checks it", () => {
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
