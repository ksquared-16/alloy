import { describe, expect, it } from "vitest";

import { isDocumentPlumbingField, plumbingFieldsOnDraft } from "@/lib/pos/formDraft/documentPlumbingFields";
import { matchCanonicalDestination } from "@/lib/pos/formDraft/canonicalImportMatch";
import { resolveFieldMapping } from "@/lib/pos/formDraft/resolveFieldMapping";
import { buildDraftSavePayload } from "@/lib/pos/formDraft/buildDraftSavePayload";
import { buildFormDraftFromStructure } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import { buildManualFormDraft } from "@/lib/pos/processingCase/formDraft/buildManualFormDraft";
import type { DraftFormField, StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/* ── fixtures ───────────────────────────────────────────────────────────────── */

const hostedField = (over: Record<string, unknown>) =>
    ({ label: "x", suggested_type: "text", required: false, confidence: "high", ...over }) as never;

const importDraft = (fields: readonly unknown[]): StoredFormDraftPreview =>
    buildFormDraftFromStructure({
        sourceDocumentId: "doc-1",
        extractedTextAvailable: true,
        extractedText: "Child Information",
        structure: { sections: [{ title: "Child Information", confidence: "high", fields }], warnings: [] } as never,
    } as never);

/** The real server-side rebuild, so every claim here survives an actual save. */
const rebuild = (draft: StoredFormDraftPreview, edits = new Map()) => {
    const built = buildDraftSavePayload(draft, edits);
    if (!built.ok) throw new Error(`payload refused: ${built.reason}`);
    return buildManualFormDraft({
        title: built.payload.title,
        sourceDocumentId: draft.source_document_id ?? null,
        fields: built.payload.fields.map((f) => ({ ...f, bbox: f.bbox ? ([...f.bbox] as [number, number, number, number]) : undefined })),
        sectionDispositions: (draft.sections ?? [])
            .filter((s) => typeof s.disposition === "string")
            .map((s) => ({ title: s.title, disposition: s.disposition! })),
    });
};

/* ── 1. confidence survives save/rebuild ───────────────────────────────────── */

describe("the importer's own confidence survives the rebuild", () => {
    const draft = importDraft([
        hostedField({ label: "Student Date of Birth", suggested_type: "date", required: true, confidence: "high", evidence: "hosted_form:f:dob" }),
        hostedField({ label: "Carpool lane preference", confidence: "low", evidence: "hosted_form:f:carpool" }),
        hostedField({ label: "Pickup window", confidence: "medium", evidence: "hosted_form:f:pickup" }),
    ]);

    it("keeps high, medium and low exactly as the importer concluded them", () => {
        const before = draft.fields.map((f) => `${f.label}=${f.confidence}`);
        expect(before).toEqual([
            "Student Date of Birth=high",
            "Carpool lane preference=low",
            "Pickup window=medium",
        ]);
        const after = rebuild(draft).fields.map((f) => `${f.label}=${f.confidence}`);
        expect(after).toEqual(before);
    });

    it("still survives after a second, unrelated save", () => {
        const twice = rebuild(rebuild(draft));
        expect(twice.fields.map((f) => f.confidence)).toEqual(["high", "low", "medium"]);
    });

    it("defaults to high only for a field the operator authored, which has no importer opinion", () => {
        const authored = buildManualFormDraft({
            title: "Hand built",
            sourceDocumentId: null,
            fields: [{ label: "Anything else?", type: "text" }],
        });
        expect(authored.fields[0]!.confidence).toBe("high");
    });

    it("does not let a save turn a Suggested mapping into a settled one", () => {
        // Low confidence is how the importer records "I have a proposal I am not sure about".
        const field: DraftFormField = {
            id: "f1",
            label: "Parent name",
            type: "text",
            required: false,
            confidence: "low",
        } as DraftFormField;
        const suggestedDraft = {
            title: "t",
            generated_form_name: "t",
            source_document_id: "d",
            sections: [{ id: "section_1", title: "Guardians", field_ids: ["f1"], disposition: "fields" }],
            fields: [field],
        } as unknown as StoredFormDraftPreview;

        expect(resolveFieldMapping(field, "Guardians").state).toBe("suggested");
        const after = rebuild(suggestedDraft, new Map([["f1", { required: true }]]));
        // The unrelated edit applied, and the proposal is still only a proposal.
        expect(after.fields[0]!.required).toBe(true);
        expect(after.fields[0]!.confidence).toBe("low");
        expect(resolveFieldMapping(after.fields[0]!, "Guardians").state).toBe("suggested");
    });
});

/* ── 2. plumbing detection keys on machine identity, not confidence ────────── */

describe("a control whose prompt is its own machine name", () => {
    it("is plumbing when the label IS the control name — however the label got there", () => {
        // The Director's case: the page labels the input with its own identifier, so the reader
        // reported high confidence and the old filter let it through.
        expect(isDocumentPlumbingField({ label: "subject_line", evidence: "hosted_form:form:subject_line" })).toBe(true);
    });

    it("is still plumbing when the reader found no label at all", () => {
        expect(isDocumentPlumbingField({ label: "subject_line", evidence: "hosted_form:subject_line" })).toBe(true);
    });

    it("preserves a human label — Subject line", () => {
        expect(isDocumentPlumbingField({ label: "Subject line", evidence: "hosted_form:form:subject_line" })).toBe(false);
    });

    it("preserves a human question — What is the subject?", () => {
        expect(isDocumentPlumbingField({ label: "What is the subject?", evidence: "hosted_form:form:subject_line" })).toBe(false);
    });

    it("preserves a snake_case label that is NOT the control's name", () => {
        // Badly named, but it is a prompt about something other than its own identity.
        expect(isDocumentPlumbingField({ label: "subject_line", evidence: "hosted_form:form:internal_subject" })).toBe(false);
    });

    it("never touches a non-hosted source", () => {
        expect(isDocumentPlumbingField({ label: "subject_line", evidence: "pdf_field" })).toBe(false);
        expect(isDocumentPlumbingField({ label: "subject_line" })).toBe(false);
    });

    it("keeps every ordinary question on the form", () => {
        for (const label of ["Child's first name", "Allergies", "Does your child have siblings?"]) {
            expect(isDocumentPlumbingField({ label, evidence: "hosted_form:form:whatever" }), label).toBe(false);
        }
    });
});

describe("a fresh import leaves the plumbing off the form", () => {
    const draft = importDraft([
        hostedField({ label: "subject_line", confidence: "high", evidence: "hosted_form:form:subject_line" }),
        hostedField({ label: "Subject line", confidence: "high", evidence: "hosted_form:form:subject_line_2" }),
        hostedField({ label: "Student Date of Birth", suggested_type: "date", required: true, evidence: "hosted_form:form:dob" }),
    ]);

    it("omits the structural control even though the page labelled it", () => {
        expect(draft.fields.some((f) => f.label === "subject_line")).toBe(false);
    });

    it("keeps the legitimate Subject line question", () => {
        expect(draft.fields.map((f) => f.label)).toEqual(["Subject line", "Student Date of Birth"]);
    });

    it("says what it left out rather than dropping it in silence", () => {
        expect(draft.warnings.join(" ")).toContain("subject_line");
    });
});

/* ── 3. an already-affected draft can be cleaned, and the action now works ─── */

describe("an existing draft that already carries the plumbing", () => {
    /* A draft from before the repair: the field is present, and it has been saved at least once. */
    const affected = {
        title: "Admissions",
        generated_form_name: "Admissions",
        source_document_id: "doc-1",
        sections: [{ id: "section_1", title: "Contact", field_ids: ["field_1", "field_2", "field_3"], disposition: "fields" }],
        fields: [
            { id: "field_1", label: "subject_line", type: "text", required: false, confidence: "high", evidence: "hosted_form:form:subject_line" },
            { id: "field_2", label: "Parent email", type: "text", required: true, confidence: "high", evidence: "hosted_form:form:parent_email" },
            { id: "field_3", label: "Allergies?", type: "select", required: false, confidence: "high", options: ["Yes", "No"], evidence: "hosted_form:form:allergies" },
        ],
    } as unknown as StoredFormDraftPreview;

    it("is recognised, where before the save had made it invisible", () => {
        // Every field here is confidence "high" — exactly the state a rebuild used to force.
        expect(plumbingFieldsOnDraft(affected.fields).map((f) => f.id)).toEqual(["field_1"]);
    });

    it("removes it explicitly, and the removal survives the rebuild", () => {
        const built = buildDraftSavePayload(affected, new Map(), new Set(["field_1"]));
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const after = buildManualFormDraft({
            title: built.payload.title,
            sourceDocumentId: "doc-1",
            fields: built.payload.fields.map((f) => ({ ...f, bbox: undefined })),
            sectionDispositions: [{ title: "Contact", disposition: "fields" }],
        });
        expect(after.fields.some((f) => f.label === "subject_line")).toBe(false);
        // ...and nothing else went with it.
        expect(after.fields.map((f) => f.label)).toEqual(["Parent email", "Allergies?"]);
        expect(after.fields[1]!.options).toEqual(["Yes", "No"]);
        expect(after.fields[0]!.required).toBe(true);
        // Re-reading the cleaned draft offers nothing further to remove.
        expect(plumbingFieldsOnDraft(after.fields)).toEqual([]);
    });

    it("is never removed on the operator's behalf", () => {
        const untouched = buildDraftSavePayload(affected, new Map());
        expect(untouched.ok).toBe(true);
        if (!untouched.ok) return;
        expect(untouched.payload.fields.map((f) => f.label)).toContain("subject_line");
    });
});

/* ── 4. import-time recognition reaches the canonical authority ────────────── */

describe("the canonical field authority is reachable at import", () => {
    it("maps the Director's question — Child → Gender — with nobody asked", () => {
        const match = matchCanonicalDestination("How would you describe your child's gender?", "Child Information");
        expect(match).not.toBeNull();
        expect(match!.fieldSource).toEqual({ entity_type: "child", field_key: "gender" });
        expect(match!.label).toBe("Gender");
        expect(match!.ruleId).toBe("child:gender");
    });

    it("maps it through the resolver the importer actually calls", () => {
        const resolved = resolveFieldMapping(
            { id: "f", label: "How would you describe your child's gender?", type: "text", required: false, confidence: "high" } as DraftFormField,
            "Child Information",
        );
        expect(resolved.state).toBe("mapped");
        expect(resolved.apply).toEqual({ entity_type: "child", field_key: "gender" });
        expect(resolved.destinationLabel).toBe("Gender");
        expect(resolved.explanation).toContain("the child");
    });

    it("writes it onto a fresh imported draft", () => {
        const draft = importDraft([
            hostedField({ label: "How would you describe your child's gender?", evidence: "hosted_form:f:child_gender" }),
        ]);
        expect(draft.fields[0]!.field_source).toEqual({ entity_type: "child", field_key: "gender" });
    });

    it("takes the subject from the section when the question omits it", () => {
        expect(matchCanonicalDestination("Gender", "Child Information")?.fieldSource).toEqual({
            entity_type: "child",
            field_key: "gender",
        });
    });

    it("still maps Student Date of Birth, and through the same pipeline", () => {
        const draft = importDraft([
            hostedField({ label: "Student Date of Birth", suggested_type: "date", required: true, evidence: "hosted_form:f:dob" }),
            hostedField({ label: "How would you describe your child's gender?", evidence: "hosted_form:f:gender" }),
        ]);
        // Both arrive mapped from one import, by the one resolver.
        expect(draft.fields.map((f) => Boolean(f.field_source))).toEqual([true, true]);
        expect(draft.fields[0]!.field_source?.field_key).toBe("child_date_of_birth");
        expect(draft.fields[1]!.field_source?.field_key).toBe("gender");
    });

    it("leaves the intent vocabulary in charge where it already recognises the question", () => {
        /*
         * The catalog route is consulted ONLY when intent recognition returns generic, so the existing
         * shortcut stays authoritative for everything it already knows. Date of birth proves it: the
         * catalog would bind `child.date_of_birth`, the intent path binds the registry's own
         * `child.child_date_of_birth` with its ask-once identity, and the resolver yields the latter.
         */
        expect(matchCanonicalDestination("Student Date of Birth", "Child Information")?.fieldSource.field_key).toBe(
            "date_of_birth",
        );
        const resolved = resolveFieldMapping(
            { id: "f", label: "Student Date of Birth", type: "date", required: true, confidence: "high" } as DraftFormField,
            "Child Information",
        );
        expect(resolved.apply).toEqual({
            entity_type: "child",
            field_key: "child_date_of_birth",
            shared_value_key: "child_date_of_birth",
        });
    });
});

/* ── 5. safety: no unambiguous evidence, no automatic mapping ──────────────── */

describe("an ambiguous question is never guessed", () => {
    it("refuses a question that names no subject", () => {
        expect(matchCanonicalDestination("Gender", "")).toBeNull();
        expect(matchCanonicalDestination("How would you describe the gender?", "Logistics")).toBeNull();
    });

    it("refuses a catalog label too generic to match on", () => {
        for (const question of [
            "Which program are you interested in for your child?",
            "What is your child's status?",
            "Any notes about your child?",
        ]) {
            expect(matchCanonicalDestination(question, "Child Information"), question).toBeNull();
        }
    });

    it("refuses a loose word that is not the catalog label", () => {
        expect(matchCanonicalDestination("Does your child have a gendered uniform preference?", "Child")).toBeNull();
    });

    it("leaves an unrecognised question exactly where the existing contract puts it", () => {
        const resolved = resolveFieldMapping(
            { id: "f", label: "Carpool lane preference", type: "text", required: false, confidence: "high" } as DraftFormField,
            "Logistics",
        );
        expect(resolved.state).toBe("form_only");
        expect(resolved.apply).toBeNull();
    });

    it("writes nothing onto the draft for an unrecognised question", () => {
        const draft = importDraft([hostedField({ label: "Carpool lane preference", evidence: "hosted_form:f:carpool" })]);
        expect(draft.fields[0]!.field_source).toBeUndefined();
    });
});

/* ── 6. whole-draft fidelity, with confidence now part of it ───────────────── */

describe("one field changes and the rest of the draft is untouched", () => {
    const draft = {
        title: "Admissions",
        generated_form_name: "Admissions",
        source_document_id: "doc-1",
        sections: [
            { id: "section_1", title: "Child Information", field_ids: ["field_1", "field_2", "field_3"], disposition: "fields" },
            { id: "section_2", title: "Consent", field_ids: ["field_4"], disposition: "signature" },
        ],
        fields: [
            { id: "field_1", label: "Student Name", type: "text", required: true, confidence: "high", field_source: { entity_type: "child", field_key: "child_first_name" }, evidence: "Student Name: __", page: 1, bbox: [1, 2, 3, 4], pdf_field_name: "student_name", layout_width: "half" },
            { id: "field_2", label: "Allergies?", type: "select", required: false, confidence: "medium", options: ["Yes", "No", "None known"] },
            { id: "field_3", label: "If yes, please describe", type: "text", required: false, confidence: "low", visible_when: { field_id: "field_2", op: "eq", value: "Yes" } },
            { id: "field_4", label: "Parent signature", type: "signature", required: true, confidence: "high" },
        ],
    } as unknown as StoredFormDraftPreview;

    const after = rebuild(draft, new Map([["field_1", { field_source: { entity_type: "person", field_key: "full_name" } }]]));

    it("applies the change asked for", () => {
        expect(after.fields[0]!.field_source).toEqual({ entity_type: "person", field_key: "full_name" });
    });

    it("keeps every field, in order, in its own section", () => {
        expect(after.fields.map((f) => f.label)).toEqual(["Student Name", "Allergies?", "If yes, please describe", "Parent signature"]);
        expect(after.sections.map((s) => s.title)).toEqual(["Child Information", "Consent"]);
        expect(after.sections[1]!.disposition).toBe("signature");
    });

    it("keeps confidence, choices, the condition, requiredness, width and provenance", () => {
        expect(after.fields.map((f) => f.confidence)).toEqual(["high", "medium", "low", "high"]);
        expect(after.fields[1]!.options).toEqual(["Yes", "No", "None known"]);
        expect(after.fields[2]!.visible_when).toEqual({ field_id: "field_2", op: "eq", value: "Yes" });
        expect(after.fields[3]!.required).toBe(true);
        expect(after.fields[0]!.layout_width).toBe("half");
        expect(after.fields[0]).toMatchObject({ page: 1, pdf_field_name: "student_name", evidence: "Student Name: __" });
    });

    it("leaves ids stable, so the condition still points at its trigger", () => {
        expect(after.fields.map((f) => f.id)).toEqual(["field_1", "field_2", "field_3", "field_4"]);
        expect(after.fields.find((f) => f.id === after.fields[2]!.visible_when!.field_id)?.label).toBe("Allergies?");
    });
});
