/**
 * IMPORT MAPPING NEVER GIVES ANOTHER PERSON'S LINE TO THE GUARDIAN.
 *
 *   1. An emergency contact's "Phone" is not the guardian's phone — whether the heading says so
 *      ("Phone" under "Emergency Contact") or the label does ("Emergency Contact Phone").
 *   2. A document extracted as ONE section still proposes its relationships, from lines that name
 *      their own relationship; lines that name no one are left for review — with a warning, never
 *      silently, and never assigned to a parent.
 *
 * Generic vocabulary only — the canonical relationship definitions decide; no school's labels.
 */
import { describe, expect, it } from "vitest";

import {
    contactLineHasNoParty,
    deriveFieldSources,
    inferQuestionIntent,
    sectionParty,
} from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import { resolveFieldMapping, safeImportMappings } from "@/lib/pos/formDraft/resolveFieldMapping";
import { buildSemanticModel } from "@/lib/pos/discovery/semanticModel";
import { discoverConcepts } from "@/lib/pos/discovery/conceptDiscovery";
import type { DraftFormField } from "@/lib/pos/processingCase/formDraft/types";

const field = (id: string, label: string, type: DraftFormField["type"] = "text"): DraftFormField =>
    ({ id, label, type, required: false, confidence: "high", evidence: "acroform" }) as DraftFormField;
const isGuardian = (fs: { entity_type?: string } | null | undefined) => fs?.entity_type === "guardian" || fs?.entity_type === "person";

describe("whose line it is comes from the canonical relationship definitions", () => {
    it.each([
        ["Emergency Contact", "emergency_contact"],
        ["Emergency Contacts (other than parents)", "emergency_contact"],
        ["Parent / Guardian #1", "guardian"],
        ["Authorized Pick-Up", "related_person"],
        ["Child's Physician", "related_person"],
        ["Child Information", "child"],
        ["Form fields", null],
        ["", null],
    ])("%s → %s", (title, party) => expect(sectionParty(title)).toBe(party));
});

describe("1. an emergency contact's phone never becomes the guardian's phone", () => {
    it("a bare Phone under an Emergency Contact heading is the contact's — no scalar destination, nothing applied", () => {
        expect(inferQuestionIntent("Phone", "Emergency Contact")).toBe("emergency_contact");
        const m = resolveFieldMapping(field("f1", "Phone"), "Emergency Contact");
        expect(m.apply).toBeNull();
        expect(isGuardian(m.proposed)).toBe(false);
        expect(safeImportMappings([field("f1", "Phone")], new Map([["f1", "Emergency Contact"]])).size).toBe(0);
    });

    it("a label that says Emergency Contact Phone is never bound to a guardian field, not even by suggestion", () => {
        const m = resolveFieldMapping(field("f2", "Emergency Contact Phone"), "Form fields");
        expect(m.apply).toBeNull();
        expect(isGuardian(m.proposed)).toBe(false);
        expect(deriveFieldSources({ subject: "other_adult", intent: "emergency_contact", displayLabel: "Emergency Contact Phone", type: "text", destinationFieldId: "emergency_phone" })).toBeUndefined();
    });

    it("pick-up and physician lines are not the guardian's either", () => {
        for (const section of ["Authorized Pick-Up", "Child's Physician"]) {
            const m = resolveFieldMapping(field("f3", "Phone"), section);
            expect(m.apply, section).toBeNull();
            expect(isGuardian(m.proposed), section).toBe(false);
        }
    });

    it("the guardian's own phone still maps — by heading or by label", () => {
        expect(resolveFieldMapping(field("f4", "Phone"), "Parent / Guardian #1")).toMatchObject({ state: "mapped", apply: { entity_type: "guardian" } });
        expect(resolveFieldMapping(field("f5", "Parent Phone"), "Form fields")).toMatchObject({ state: "mapped", apply: { entity_type: "guardian" } });
    });

    it("a Phone that nothing names is AMBIGUOUS: suggested for review, never applied at import", () => {
        expect(contactLineHasNoParty("Phone", "Form fields")).toBe(true);
        expect(contactLineHasNoParty("Phone", "Parent / Guardian")).toBe(false);
        expect(contactLineHasNoParty("Parent Phone", "Form fields")).toBe(false);
        const m = resolveFieldMapping(field("f6", "Phone"), "Form fields");
        expect(m.state).not.toBe("mapped");
        expect(m.apply).toBeNull();
        expect(safeImportMappings([field("f6", "Phone")], new Map([["f6", "Form fields"]])).size).toBe(0);
    });
});

describe("2. a document read as one section still finds its relationships — and says what it could not", () => {
    const oneSection = {
        sections: [{
            title: "Form fields",
            page: 1,
            fields: [
                { label: "Child Name", suggested_type: "text", evidence: "e1" },
                { label: "Parent/Guardian Name", suggested_type: "text", evidence: "e2" },
                { label: "Parent/Guardian Phone", suggested_type: "text", evidence: "e3" },
                { label: "Emergency Contact Name", suggested_type: "text", evidence: "e4" },
                { label: "Emergency Contact Phone", suggested_type: "text", evidence: "e5" },
                { label: "Emergency Contact Relationship to Child", suggested_type: "text", evidence: "e6" },
                { label: "Physician Name", suggested_type: "text", evidence: "e7" },
                { label: "Phone", suggested_type: "text", evidence: "e8" },
                { label: "Authorized to give medication?", suggested_type: "boolean", evidence: "e9" },
            ],
        }],
        warnings: [],
    };
    const model = buildSemanticModel(oneSection as never);

    it("lines that name their relationship become that relationship's own section; the rest stay", () => {
        const titles = model.sections.map((s) => [s.title, s.fields.map((f) => f.label)]);
        expect(titles).toEqual([
            ["Form fields", ["Child Name", "Parent/Guardian Name", "Parent/Guardian Phone", "Phone", "Authorized to give medication?"]],
            ["Emergency Contacts", ["Emergency Contact Name", "Emergency Contact Phone", "Emergency Contact Relationship to Child"]],
            ["Physician Name", ["Physician Name"]],
        ]);
        expect(model.sections.filter((s) => s.repeated_person).map((s) => s.title)).toEqual(["Emergency Contacts", "Physician Name"]);
    });

    it("relationship discovery proposes the emergency-contact and physician relationships", () => {
        const roles = discoverConcepts(model).filter((c) => c.kind === "relationship_group").map((c) => c.relationship_role);
        expect(roles).toEqual(expect.arrayContaining(["emergency_contact", "physician"]));
    });

    it("is not silent: the document warns about the separation and about the line that names no one", () => {
        expect(model.warnings.some((w) => /identified from their own labels/.test(w))).toBe(true);
        expect(model.warnings.some((w) => /name no person \(Phone\)/.test(w) && /rather than assigned to a parent/.test(w))).toBe(true);
    });

    it("a document with real headings is unchanged", () => {
        const headed = buildSemanticModel({
            sections: [
                { title: "Emergency Contact", page: 1, fields: [{ label: "Name", suggested_type: "text" }, { label: "Phone", suggested_type: "text" }] },
                { title: "Parent / Guardian", page: 1, fields: [{ label: "Name", suggested_type: "text" }, { label: "Phone", suggested_type: "text" }] },
            ],
            warnings: [],
        } as never);
        expect(headed.sections.map((s) => s.title)).toEqual(["Emergency Contact", "Parent / Guardian"]);
        expect(headed.warnings).toEqual([]);
    });

    it("a bare Phone in an emergency section is the emergency contact's concept, never person.phone", () => {
        const sigSection = buildSemanticModel({
            sections: [{ title: "Emergency Contact", page: 1, fields: [
                { label: "Phone", suggested_type: "text" },
                { label: "Signature", suggested_type: "signature" },
            ] }],
            warnings: [],
        } as never);
        const phone = discoverConcepts(sigSection).find((c) => c.source.labels.includes("Phone"));
        expect(phone?.concept_key).not.toBe("person.phone");
    });
});
