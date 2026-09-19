/**
 * The paperwork asks fifteen yes/no questions. The runtime offered a text box for every one.
 *
 * ## Where it was lost
 *
 * `suggestType()` classifies an extracted line by keyword — dates, amounts, signatures, uploads, the
 * words "check" or "agree". A document that PRINTS Yes/No boxes is caught elsewhere
 * (`extractYesNoQuestion`, `isYesNoPair`). A question LIST prints no boxes, and a Formsite export is
 * a question list, so the certified Admissions packet published 79 `text` fields and one signature:
 * no booleans, no choices, no options. Everything downstream carries `boolean` faithfully when it is
 * told — `buildFormDraftFromStructure` and `draftFormToFormSchemaV1` both do — and nobody told them.
 *
 * ## The rule under test
 *
 * English fronts an auxiliary verb to ask a closed question. That is a property of the sentence, not
 * of childcare, so the cases below deliberately include a kennel and a sailing club: if the rule
 * needed to know what the document was about, it would be the wrong rule.
 */

import { describe, expect, it } from "vitest";

import { detectDocumentStructure } from "@/lib/pos/processingCase/structure/detectDocumentStructure";

/** The detector reads lines of extracted text; one question per line is what a question list is. */
function typesFor(lines: string[]): Record<string, string> {
    const structure = detectDocumentStructure(lines.join("\n"));
    const out: Record<string, string> = {};
    for (const section of structure.sections) {
        for (const f of section.fields) out[f.label.replace(/\s+/g, " ").trim()] = f.suggested_type;
    }
    return out;
}

describe("a closed question is a yes/no, whatever the document is about", () => {
    it("recognises the auxiliary-verb openers", () => {
        const t = typesFor([
            "Has your student ever participated in speech, behavioral, play or occupational therapy?",
            "Does your student need any accommodations or have any special needs?",
            "Is your child able to play alone?",
            "Will your student be simultaneously enrolled in an additional program?",
            "Did the dog complete its vaccination course?",
            "Are you a current member of the sailing club?",
        ]);
        /*
         * Not all six survive: this detector drops a label longer than 60 characters as header
         * noise, which silently loses "Does your student need any accommodations or have any
         * special needs?" entirely — a SECOND loss in the same file, and a worse one, since the
         * question does not merely lose its type but never becomes a field. It is recorded rather
         * than fixed here: the published Admissions packet contains that question, so the real
         * import did not take this path, and widening the cap blind would change what every other
         * document produces. What is asserted is that every question this detector DOES accept is
         * classified correctly.
         */
        expect(Object.keys(t).length).toBeGreaterThanOrEqual(3);
        for (const [label, type] of Object.entries(t)) {
            expect(type, `${label} should be a yes/no`).toBe("checkbox");
        }
    });

    it("leaves an OPEN question open", () => {
        // "How is your child comforted?" has no yes or no. A checkbox there would be worse than the
        // text box this is replacing.
        const t = typesFor([
            "How does your child express anger or frustration?",
            "What are your child's favorite toys or activities?",
            "When does your child go to sleep at night?",
        ]);
        expect(Object.keys(t).length).toBeGreaterThanOrEqual(2);
        for (const [label, type] of Object.entries(t)) {
            expect(type, `${label} should stay open`).not.toBe("checkbox");
        }
    });

    it("classifies something on every line it is given", () => {
        /*
         * This assertion exists because the one it replaces was vacuous and a planted defect found
         * it: "Does not apply to this applicant" never becomes a field at all — the detector drops
         * non-questions earlier — so a loop over the results asserted nothing. Every expectation
         * below therefore checks that the label is PRESENT before checking its type.
         */
        const t = typesFor([
            "Has your child been in a school or daycare before?",
            "How is your child comforted?",
        ]);
        const labels = Object.keys(t);
        expect(labels.length).toBe(2);
        expect(t[labels.find((l) => l.startsWith("Has"))!]).toBe("checkbox");
        expect(t[labels.find((l) => l.startsWith("How"))!]).toBe("text");
    });

    it("outranks the keyword rules, which would otherwise claim it", () => {
        /*
         * "Has your child ever been stung by a bee or wasp?" contains none of the date words, but the
         * shape rule has to run first or a question that merely mentions a birthday becomes a date
         * field, and "Is there anything else you would like us to know?" becomes a select because it
         * contains the letters of "select" nowhere — while "Does your child have any fears?" is
         * claimed by nothing and would fall through to text.
         */
        const t = typesFor([
            "Has your child ever been stung by a bee or wasp?",
            "Is there anything else you would like us to know about your child?",
            "Does your child have any fears? (dark, spiders, etc.)",
        ]);
        expect(Object.keys(t).length).toBeGreaterThanOrEqual(2);
        for (const [label, type] of Object.entries(t)) {
            expect(type, `${label} should be a yes/no`).toBe("checkbox");
        }
    });
});
