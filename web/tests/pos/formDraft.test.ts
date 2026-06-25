/**
 * POS-FP12 — Document → Form Template (Workflow A).
 *
 * Proves: document structure → draft form (title/sections/fields/types/required);
 * honest empty when no text; choice fields drafted as text (never fake options);
 * title derivation (text → filename → classification); the draft converts into a VALID
 * existing `FormSchemaV1` (parsed by the live zod schema); and persistence is
 * annotation-only (no form row, no publish, no status/case_type).
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectDocumentStructure } from "@/lib/pos/processingCase/structure/detectDocumentStructure";
import {
    buildFormDraftFromStructure,
    FORM_DRAFT_GENERATOR_VERSION,
} from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { deriveDocumentTitle, cleanFilenameToTitle } from "@/lib/pos/processingCase/formDraft/deriveDocumentTitle";
import {
    dbStoreFormDraftPreview,
    parseStoredFormDraftPreview,
    stampFormDraftPreview,
} from "@/lib/pos/processingCase/formDraft/formDraftPreviewDb";
import { validateFormSchema } from "@/lib/forms/schema";

const HEALTH_REPORT_TEXT = [
    "School Age Child Health Report",
    "CHILD INFORMATION",
    "Child Name: ______",
    "Date of Birth: __/__/____",
    "IMMUNIZATIONS",
    "Up to date?",
    "Provider Signature: ______",
].join("\n");

function draftFromText(text: string | null, opts: { fileName?: string; classificationKey?: string } = {}) {
    return buildFormDraftFromStructure({
        structure: detectDocumentStructure(text),
        sourceDocumentId: "doc-1",
        extractedText: text,
        fileName: opts.fileName ?? null,
        classificationKey: opts.classificationKey ?? null,
        extractedTextAvailable: Boolean(text),
    });
}

describe("buildFormDraftFromStructure — structure → draft", () => {
    it("recreates sections + fields with mapped types and required flags", () => {
        const draft = draftFromText(HEALTH_REPORT_TEXT);
        expect(draft.sections.length).toBeGreaterThanOrEqual(1);
        const byLabel = Object.fromEntries(draft.fields.map((f) => [f.label.toLowerCase(), f]));
        expect(byLabel["child name"]?.type).toBe("text");
        expect(byLabel["date of birth"]?.type).toBe("date");
        expect(byLabel["provider signature"]?.type).toBe("signature");
        // sections reference real field ids
        for (const s of draft.sections) for (const fid of s.field_ids) expect(byLabel ? draft.fields.some((f) => f.id === fid) : false).toBe(true);
        expect(draft.generator_version).toBe(FORM_DRAFT_GENERATOR_VERSION);
    });

    it("title derived from document text", () => {
        const draft = draftFromText(HEALTH_REPORT_TEXT);
        expect(draft.title).toBe("School Age Child Health Report");
        expect(draft.title_from_text).toBe(true);
    });

    it("no text → empty draft + warning, honest unavailable", () => {
        const draft = draftFromText(null, { fileName: "blank.pdf" });
        expect(draft.fields).toEqual([]);
        expect(draft.sections).toEqual([]);
        expect(draft.extracted_text_available).toBe(false);
        expect(draft.warnings.length).toBeGreaterThan(0);
    });

    it("choice-like field is drafted as text with a warning (never fake options)", () => {
        const draft = draftFromText("REGISTRATION\nGender (circle one): ______");
        const f = draft.fields.find((x) => /gender/i.test(x.label));
        expect(f?.type).toBe("text");
        expect(draft.warnings.some((w) => /choices|options/i.test(w))).toBe(true);
    });
});

describe("deriveDocumentTitle — title/display derivation", () => {
    it("prefers a heading from text", () => {
        expect(deriveDocumentTitle({ extractedText: "Enrollment Application\nName: ___" }).title).toBe("Enrollment Application");
    });
    it("falls back to a cleaned filename", () => {
        const d = deriveDocumentTitle({ fileName: "mo500-3313-school-age-child-health-report_0.pdf" });
        expect(d.fromText).toBe(false);
        expect(d.title).toMatch(/School Age Child Health Report/);
        expect(d.title).not.toMatch(/\.pdf/);
    });
    it("falls back to classification label, then Untitled", () => {
        expect(deriveDocumentTitle({ classificationKey: "immunization_record" }).title).toBe("Immunization Record");
        expect(deriveDocumentTitle({}).title).toBe("Untitled form");
    });
    it("cleanFilenameToTitle drops extension + separators + trailing index", () => {
        expect(cleanFilenameToTitle("subsidy_voucher_ccap_2026.pdf")).toBe("Subsidy Voucher Ccap 2026");
    });
});

describe("draftFormToFormSchemaV1 — converts to a VALID existing FormSchemaV1", () => {
    it("produces a schema the live zod validator accepts (no new form system)", () => {
        const draft = stampFormDraftPreview(draftFromText(HEALTH_REPORT_TEXT));
        const schema = draftFormToFormSchemaV1(draft);
        // Must parse against the real form schema used by the builder/runtime.
        const parsed = validateFormSchema(schema);
        expect(parsed.schema_version).toBe(1);
        expect(parsed.title).toBe("School Age Child Health Report");
        expect(parsed.fields.length).toBe(draft.fields.length);
        // every section field_id references a real top-level field
        const ids = new Set(parsed.fields.map((f) => f.id));
        for (const s of parsed.sections) for (const fid of s.field_ids) expect(ids.has(fid)).toBe(true);
    });

    it("an empty draft still converts to a valid (empty) schema", () => {
        const draft = stampFormDraftPreview(draftFromText(null, { fileName: "x.pdf" }));
        const parsed = validateFormSchema(draftFormToFormSchemaV1(draft));
        expect(parsed.fields).toEqual([]);
        expect(parsed.sections).toEqual([]);
    });
});

// --- persistence: annotation only, no form row, no publish -----------------------------

function makeFakeSupabase(existingMetadata: Record<string, unknown> = {}) {
    const updates: { table: string; payload: Record<string, unknown> }[] = [];
    let inserted = false;
    const supabase = {
        from(table: string) {
            if (table !== "processing_cases") throw new Error(`draft must not touch table "${table}"`);
            return {
                select() {
                    return { eq() { return { eq() { return { maybeSingle: async () => ({ data: { metadata: existingMetadata }, error: null }) }; } }; } };
                },
                update(payload: Record<string, unknown>) {
                    updates.push({ table, payload });
                    return { eq() { return { eq: async () => ({ error: null }) }; } };
                },
                insert() { inserted = true; throw new Error("draft must not insert"); },
            };
        },
    } as unknown as SupabaseClient;
    return { supabase, updates, get inserted() { return inserted; } };
}

describe("dbStoreFormDraftPreview — metadata only, no form, no publish", () => {
    it("writes ONLY metadata.form_draft_preview; preserves siblings; never inserts", async () => {
        const fake = makeFakeSupabase({ classification: { classification_key: "form_like_document" }, extraction: { x: 1 } });
        const draft = stampFormDraftPreview(draftFromText(HEALTH_REPORT_TEXT), new Date("2026-06-17T10:00:00.000Z"));
        await dbStoreFormDraftPreview(fake.supabase, { orgId: "o1", caseId: "c1", draft });
        expect(fake.updates).toHaveLength(1);
        const payload = fake.updates[0].payload;
        expect(Object.keys(payload)).toEqual(["metadata"]);
        expect("case_type" in payload).toBe(false);
        expect("status" in payload).toBe(false);
        const meta = payload.metadata as Record<string, unknown>;
        expect(meta.classification).toEqual({ classification_key: "form_like_document" });
        expect((meta.form_draft_preview as { generator_version: string }).generator_version).toBe(FORM_DRAFT_GENERATOR_VERSION);
        expect(fake.inserted).toBe(false);
    });
});

describe("parseStoredFormDraftPreview", () => {
    it("round-trips", () => {
        const draft = stampFormDraftPreview(draftFromText(HEALTH_REPORT_TEXT), new Date("2026-06-17T10:00:00.000Z"));
        expect(parseStoredFormDraftPreview({ form_draft_preview: draft, classification: { k: 1 } })).toEqual(draft);
    });
    it("null when absent/malformed", () => {
        expect(parseStoredFormDraftPreview({})).toBeNull();
        expect(parseStoredFormDraftPreview(null)).toBeNull();
        expect(parseStoredFormDraftPreview({ form_draft_preview: { title: "x" } })).toBeNull();
    });
});
