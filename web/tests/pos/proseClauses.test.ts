import { describe, expect, it } from "vitest";
import { acknowledgementClauses, documentRequestClauses, splitProseSentences } from "@/lib/pos/discovery/proseClauses";

// The real "Parent Authorizations" page of the School of Enrichment handbook, wrapped at the same
// line breaks the PDF draws. Seven distinct commitments under one heading.
const PARENT_AUTHORIZATIONS = `Parent Authorizations
I have read and accept the conditions outlined in the Parent Handbook, the Classroom
Application, Enrollment Form, and the Tuition Agreement.
I understand that every effort will be made to contact me in the event of an emergency requiring
medical attention for my child.
I hereby give permission for my child to be cared for by School of Enrichment and for my child to
use all the play equipment and participate in all activities of the school.
I hereby grant permission for my child to leave the school premises under the supervision of the
staff members for planned neighborhood walks or field trips.
I hereby release and hold harmless School of Enrichment, its staff and agents, from any loss or
damage to toys, clothes, or any other personal items or articles.
I grant permission for my child to be included in photographs connected with School of
Enrichment.
I hereby give permission for School of Enrichment to include my information in a parent directory
to be used for social events and gatherings.`;

describe("splitProseSentences — text lifted from a PDF is wrapped, not paragraphed", () => {
    it("rejoins a sentence that the page broke across two lines", () => {
        const out = splitProseSentences("I understand my child may\nbe excluded from school or child care.");
        expect(out).toEqual(["I understand my child may be excluded from school or child care."]);
    });

    it("keeps a finished line and the next sentence apart", () => {
        const out = splitProseSentences("I certify this is accurate.\nParent, guardian or medical provider may sign.");
        expect(out).toHaveLength(2);
    });

    it("splits two sentences that share a line", () => {
        const out = splitProseSentences("I have received the information. I understand the risks.");
        expect(out).toEqual(["I have received the information.", "I understand the risks."]);
    });
});

describe("acknowledgementClauses — a consent page is not one acknowledgement", () => {
    it("finds every distinct commitment on the real Parent Authorizations page", () => {
        const clauses = acknowledgementClauses(PARENT_AUTHORIZATIONS);
        expect(clauses).toHaveLength(7);
        expect(clauses.map((c) => c.text.slice(0, 24))).toEqual([
            "I have read and accept t",
            "I understand that every ",
            "I hereby give permission",
            "I hereby grant permissio",
            "I hereby release and hol",
            "I grant permission for m",
            "I hereby give permission",
        ]);
    });

    it("gives each clause its own identity so two pages of the same clause count once", () => {
        const twice = `${PARENT_AUTHORIZATIONS}\n${PARENT_AUTHORIZATIONS}`;
        expect(acknowledgementClauses(twice)).toHaveLength(7);
    });

    it("does not count a request for a document as a consent", () => {
        const text = "I have attached the required immunization records. I certify the record is accurate.";
        const acks = acknowledgementClauses(text);
        expect(acks).toHaveLength(1);
        expect(acks[0].text).toContain("I certify");
    });

    it("stays silent on prose that commits to nothing", () => {
        expect(acknowledgementClauses("Drop off is between 8:00am and 8:45am. Capacity is 75 students.")).toEqual([]);
        expect(acknowledgementClauses(null)).toEqual([]);
    });

    it("does not double-count the same clause repeated in another language", () => {
        // The CIS prints every clause twice, English then Spanish. Only the English one is read —
        // an honest miss for a Spanish-only form, never a duplicate for a bilingual one.
        const bilingual = "I certify that the information on the form is accurate.\nCertifico que la información en el formulario es exacta.";
        expect(acknowledgementClauses(bilingual)).toHaveLength(1);
    });
});

describe("documentRequestClauses — named from the sentence, not from a table of known documents", () => {
    it("recognizes a request for a document nobody has seen before", () => {
        const clauses = documentRequestClauses("Please submit a notarized guardianship letter before the first day.");
        expect(clauses).toHaveLength(1);
        expect(clauses[0].text).toContain("guardianship letter");
    });

    it("recognizes the CIS's exemption attachment", () => {
        expect(documentRequestClauses("I have attached the required document from (check one):")).toHaveLength(1);
    });

    it("does not treat every mention of a form as a request", () => {
        expect(documentRequestClauses("This form is collected on behalf of the Health Authority.")).toEqual([]);
    });
});
