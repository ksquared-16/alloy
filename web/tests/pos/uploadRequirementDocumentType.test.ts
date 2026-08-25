/**
 * §2 — an upload requirement names a document Alloy already knows, or says it does not.
 *
 * An untyped attachment is the quiet version of losing the requirement: the file arrives, nothing
 * knows what it is, and a later "do we have their immunization record?" cannot be answered without
 * a human opening the PDF.
 *
 * The classification vocabulary already exists (`classifyNonFormSource`). Discovery reuses it rather
 * than growing a second document vocabulary — the same rule that sent field matching to
 * `suggestFieldBinding` in Slice 1.
 */

import { describe, expect, it } from "vitest";
import { matchConcepts } from "@/lib/pos/discovery/configurationMatching";
import { DISCOVERY_CONTRACT_VERSION, type BusinessConceptCandidate } from "@/lib/pos/discovery/contracts";

const uploadConcept = (label: string): BusinessConceptCandidate => ({
    contract_version: DISCOVERY_CONTRACT_VERSION,
    id: `1:req:${label.slice(0, 12)}`,
    kind: "upload_requirement",
    label,
    concept_key: "requirement.upload.x",
    subject: "child",
    cardinality: "single",
    suggested_data_type: "file",
    source: { page: 1, section_title: "Requirements", section_key: "req", labels: [label] },
    confidence: { band: "review", percent: 65, signals: [] },
    explanation: "",
});

const proposeFor = (label: string) => matchConcepts([uploadConcept(label)])[0];

describe("a requested document that Alloy has a name for", () => {
    it("classifies the real packet's immunization clause", () => {
        const p = proposeFor("Completed immunization records must be provided on or before the first day of care.");
        expect(p.disposition).toBe("upload_requirement");
        expect(p.target_document_classification).toBe("immunization_record");
        expect(p.explanation).toContain("Immunization record");
    });

    it("classifies the updated-records clause the same way", () => {
        expect(proposeFor("Please bring us all updated records after receiving new immunizations.").target_document_classification).toBe(
            "immunization_record",
        );
    });
});

describe("a wrong type is worse than no type", () => {
    it("does not classify the ACH clause as a form-like document", () => {
        // Found in the real packet. The platform classifier matched its `form` token INSIDE the word
        // "information" — the same substring defect that once read "hib" inside "prohibiting" and
        // "parent" inside "Parent Handbook". Fixed at the classifier (a token now matches at the
        // start of a word, keeping deliberate prefixes like `immun`), and guarded again here.
        const p = proposeFor("To update information provided in your ACH account, complete this authorization.");
        expect(p.target_document_classification).toBeUndefined();
    });

    it("keeps the deliberate prefix tokens working", async () => {
        const { classifyNonFormSource } = await import("@/lib/pos/processingCase/classification/classifyNonFormSource");
        expect(classifyNonFormSource({ sourceKind: "document", title: "Immunisation summary" }).classification_key).toBe(
            "immunization_record",
        );
        expect(classifyNonFormSource({ sourceKind: "document", title: "Enrollment agreement" }).classification_key).toBe(
            "enrollment_document",
        );
    });

    it("requires more than one weak keyword to name a document", () => {
        // A single 0.4-weight signal is a guess. The requirement survives; only the type is withheld.
        const p = proposeFor("Please complete the attached form.");
        expect(p.target_document_classification).toBeUndefined();
        expect(p.target_requirement_type).toBe("upload");
    });
});

describe("a requested document that Alloy has NO name for", () => {
    it("leaves the real packet's care-plan clause unclassified rather than forcing a type", () => {
        // The packet asks for an individual health care plan. There is no such classification key,
        // and inventing one inside Enrollment would put a second document vocabulary next to the
        // platform's. The requirement still exists; only the TYPE is absent, and it says so.
        const p = proposeFor("care plan must be provided on or before the first day of care.");
        expect(p.disposition).toBe("upload_requirement");
        expect(p.target_document_classification).toBeUndefined();
        expect(p.explanation).toMatch(/no canonical document type/i);
    });

    it("does not invent a type for a physical or assessment report either", () => {
        expect(proposeFor("A physical examination report signed by your child's physician.").target_document_classification).toBeUndefined();
        expect(proposeFor("Developmental assessment results, if available.").target_document_classification).toBeUndefined();
    });

    it("still produces a real upload requirement when the type is unknown", () => {
        // The gap must never cost the requirement itself.
        const p = proposeFor("A physical examination report signed by your child's physician.");
        expect(p.target_requirement_type).toBe("upload");
        expect(p.validation_issues).toEqual([]);
    });
});
