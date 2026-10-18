/**
 * DOCUMENT IMPORT, END TO END: WHOSE ANSWER EACH LINE IS.
 *
 * Measured on deployed staging (Document & Processing closeout, disposable ZZQA1492 documents) after
 * #1489. Each fixture here is the exact document imported there, run through the same pipeline the
 * import route uses (`chooseDraftForCase` → `initializeStrongUnderstanding`):
 *
 *   • HTML whose inputs sit inside their <label> — every field took its NEIGHBOUR's label (the
 *     guardian's Email read "Phone" and landed with the emergency contact).
 *   • HTML grouped by <fieldset>/<legend> — read as one section; the legends were ignored.
 *   • A one-section AcroForm — the bare "Phone"/"Email" nobody owns were bound to `person.*` at import,
 *     and the emergency contact's lines stayed loose beside the collection discovery proposed.
 *
 * Generic HTML/PDF semantics only; no school's labels or field ids.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { chooseDraftForCase } from "@/lib/pos/processingCase/formDraft/buildFormDraftForCaseSafe";
import { initializeStrongUnderstanding } from "@/lib/pos/discovery/initializeStrongUnderstanding";
import { extractPdfAcroFormFields } from "@/lib/pos/processingCase/structure/pdfAcroForm";

const dir = resolve(__dirname, "fixtures/import-ownership");
const bytes = (f: string) => new Uint8Array(readFileSync(resolve(dir, f)));

async function importDoc(file: string, mimeType: string) {
    const draft = await chooseDraftForCase({
        sourceDocumentId: "doc-1",
        fileName: file,
        classificationKey: null,
        mimeType,
        text: { available: false, text: null, reason: "no_text" },
        pdfBytes: bytes(file),
        extractAcroForm: extractPdfAcroFormFields,
    });
    const applied = initializeStrongUnderstanding(draft).draft;
    const byId = new Map(applied.fields.map((f) => [f.id, f]));
    const sections = applied.sections.map((s) => ({ title: s.title, fields: s.field_ids.map((id) => byId.get(id)!) }));
    return { draft: applied, sections };
}
const isGuardianOrPerson = (fs: { entity_type?: string } | undefined | null) => fs?.entity_type === "guardian" || fs?.entity_type === "person";

describe("HTML: a control inside its <label> is named by that label", () => {
    it("every field keeps its own label, in its own section", async () => {
        const { sections } = await importDoc("nested-labels.html", "text/html");
        expect(sections.map((s) => [s.title, s.fields.map((f) => f.label)])).toEqual([
            ["Child Information", ["Child's Name", "Date of Birth"]],
            ["Parent / Guardian", ["Name", "Phone", "Email"]],
            ["Emergency Contact", ["Name", "Phone", "Relationship to child"]],
            ["Child's Physician", ["Name", "Phone"]],
        ]);
    });

    it("the emergency contact's and physician's lines are never the guardian's", async () => {
        const { sections } = await importDoc("nested-labels.html", "text/html");
        for (const title of ["Emergency Contact", "Child's Physician"]) {
            for (const f of sections.find((s) => s.title === title)!.fields) expect(isGuardianOrPerson(f.field_source), `${title}/${f.label}`).toBe(false);
        }
        const guardianPhone = sections.find((s) => s.title === "Parent / Guardian")!.fields.find((f) => f.label === "Phone")!;
        expect(guardianPhone.suppressed_by_collection ?? guardianPhone.field_source?.entity_type).toBeTruthy();
    });
});

describe("HTML: a <fieldset>'s <legend> is its section heading", () => {
    it("fieldsets become sections, so relationships are discovered from them", async () => {
        const { sections, draft } = await importDoc("fieldset-legends.html", "text/html");
        expect(sections.map((s) => s.title)).toEqual(expect.arrayContaining(["Child Information", "Parent / Guardian", "Emergency Contact", "Child's Physician"]));
        const roles = (draft.configuration_discovery?.concepts ?? []).filter((c) => c.kind === "relationship_group").map((c) => c.relationship_role);
        expect(roles).toEqual(expect.arrayContaining(["emergency_contact", "physician"]));
    });
});

describe("one-section PDF: ownership from each line's own words, ambiguity left to a person", () => {
    it("the bare Phone and Email nobody owns are NOT bound at import", async () => {
        const { sections } = await importDoc("one-section-acroform.pdf", "application/pdf");
        const loose = sections.flatMap((s) => s.fields).filter((f) => f.label === "Phone" || f.label === "Email");
        expect(loose).toHaveLength(2);
        for (const f of loose) expect(f.field_source ?? null, f.label).toBeNull();
    });

    it("the guardian's own labelled phone still binds to the guardian", async () => {
        const { sections } = await importDoc("one-section-acroform.pdf", "application/pdf");
        const f = sections.flatMap((s) => s.fields).find((x) => x.label === "Parent/Guardian Phone")!;
        expect(f.field_source?.entity_type).toBe("guardian");
    });

    it("the emergency contact's and physician's lines belong to their collections, not loose beside them", async () => {
        const { draft } = await importDoc("one-section-acroform.pdf", "application/pdf");
        const byLabel = new Map(draft.fields.map((f) => [f.label.toLowerCase(), f]));
        expect(byLabel.get("emergency contact phone")?.suppressed_by_collection).toBe("col_emergency_contacts");
        expect(byLabel.get("emergency contact name")?.suppressed_by_collection).toBe("col_emergency_contacts");
        // A physician is routed from its own line to the physician relationship, never to a person field.
        const doctor = (draft.configuration_discovery?.proposals ?? []).find((p) => p.target_relationship_role === "physician");
        expect(doctor?.disposition).toBe("relationship_binding");
        expect(isGuardianOrPerson(byLabel.get("physician name")?.field_source)).toBe(false);
        // Never claimed: the lines that name no one, and the guardian's.
        expect(byLabel.get("phone")?.suppressed_by_collection ?? null).toBeNull();
        expect(byLabel.get("parent/guardian phone")?.suppressed_by_collection ?? null).toBeNull();
        const warnings = draft.configuration_discovery?.warnings ?? [];
        expect(warnings.some((w) => /name no person \(Phone, Email\)/.test(w))).toBe(true);
    });
});
