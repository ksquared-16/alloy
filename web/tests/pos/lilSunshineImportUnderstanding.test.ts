/**
 * Lil' Sunshine — the Director's own paperwork, imported the way staging imports it.
 *
 * The fixture is the uploaded PDF (blank paperwork, no family data). It is read through the same
 * `chooseDraftForCase` path the detection route runs, with the production AcroForm and positional
 * readers, so the 30 questions in 5 sections are what staging produced for this document.
 *
 * What the paper means, not what it prints:
 *  - the tuition blanks and "agree to pay $" are amounts the school sets — Financials owns them;
 *  - "Requested Start Date" is the enrolment start, not "today";
 *  - the office's own dates are not the family's, and are not "today" either;
 *  - two printed "Child's Name / Birthdate" rows are two children, not one child asked twice;
 *  - a cell carrier is not a phone number.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import { chooseDraftForCase } from "@/lib/pos/processingCase/formDraft/buildFormDraftForCaseSafe";
import { extractPdfAcroFormFields } from "@/lib/pos/processingCase/structure/pdfAcroForm";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";
import { initializeStrongUnderstanding } from "@/lib/pos/discovery/initializeStrongUnderstanding";
import { financialQuestionsOnDraft } from "@/lib/pos/formDraft/financialSourceQuestions";

let draft: StoredFormDraftPreview;

beforeAll(async () => {
    draft = await chooseDraftForCase({
        sourceDocumentId: "doc-lil-sunshine",
        fileName: "Lil-Sunshine-Childcare-Enrollment-packet.pdf",
        classificationKey: "enrollment_document",
        text: {
            available: true,
            text: readFileSync("tests/fixtures/processing/lil-sunshine-enrollment-application.text.txt", "utf8"),
            reason: null,
        },
        pdfBytes: new Uint8Array(readFileSync("tests/fixtures/processing/lil-sunshine-childcare-enrollment-packet.pdf")),
        mimeType: "application/pdf",
        extractAcroForm: extractPdfAcroFormFields,
    });
}, 60_000);

const proposalFor = (label: string) => {
    const d = draft.configuration_discovery!;
    const concept = d.concepts.find((c) => c.label === label);
    return concept ? d.proposals.find((p) => p.candidate_id === concept.id) : undefined;
};

describe("Lil' Sunshine imports as what it means", () => {
    it("reads the questions staging read", () => {
        expect(draft.fields).toHaveLength(30);
        expect(draft.sections).toHaveLength(5);
    });

    it("names every amount the school sets as Financials' — and nothing else", () => {
        expect(financialQuestionsOnDraft(draft).map((f) => f.label).sort()).toEqual(
            ["Client(s) agree to pay $", "Paid by: Cash Check", "Total $", "Tuition Child 1 $", "Tuition Child 2 $", "Tuition Paid"].sort(),
        );
    });

    it("reads a start date as the enrolment start, and only the bare Date as the day it was signed", () => {
        for (const label of ["Requested Start Date", "Start Date"]) {
            const p = proposalFor(label);
            expect(p?.disposition, label).toBe("reuse_canonical_field");
            expect(p?.target_field_source?.field_key, label).toBe("start_date");
        }
        expect(proposalFor("Date")?.disposition).toBe("derived_value_system");
        for (const label of ["Date Contacted for Enrollment", "Date of Enrollment Meeting"]) {
            expect(proposalFor(label)?.disposition, label).not.toBe("derived_value_system");
        }
    });

    it("leaves two printed children for the operator instead of writing both onto one child", () => {
        const result = initializeStrongUnderstanding(draft);
        const skippedConcepts = result.skipped
            .filter((s) => s.reason === "repeated_rows")
            .map((s) => draft.configuration_discovery!.concepts.find((c) => draft.configuration_discovery!.proposals.find((p) => p.id === s.proposal_id)?.candidate_id === c.id)?.label);
        expect(skippedConcepts).toEqual(expect.arrayContaining(["Child’s Name", "Birthdate"]));
        // Nothing the resolver already settled is re-decided.
        const before = new Map(draft.fields.map((f) => [f.id, JSON.stringify(f.field_source ?? null)]));
        for (const f of result.draft.fields) {
            if (before.get(f.id) !== "null") expect(JSON.stringify(f.field_source ?? null), f.label).toBe(before.get(f.id));
        }
    });

    it("does not store a cell carrier as a phone number", () => {
        expect(draft.fields.find((f) => f.label === "Cell Carrier")?.field_source).toBeUndefined();
    });
});
