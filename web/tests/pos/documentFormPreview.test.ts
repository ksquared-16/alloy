/**
 * POS-FP11 — Document → Form structure foundation.
 *
 * Proves: no text → honest unavailable (no fabricated fields); simple labelled text →
 * section/field candidates with suggested types; the preview is stored as metadata ONLY
 * (no form row, no status/case_type, no publish); upload-style best-effort never throws.
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectDocumentStructure, STRUCTURE_GENERATOR_VERSION } from "@/lib/pos/processingCase/structure/detectDocumentStructure";
import { extractDocumentTextSafe } from "@/lib/pos/processingCase/structure/extractDocumentTextSafe";
import {
    dbStoreDocumentFormPreview,
    parseStoredDocumentFormPreview,
    toStoredDocumentFormPreview,
} from "@/lib/pos/processingCase/structure/documentFormPreviewDb";
import { maybeBuildDocumentFormPreviewSafe } from "@/lib/pos/processingCase/structure/maybeBuildDocumentFormPreviewSafe";

describe("detectDocumentStructure — deterministic, honest", () => {
    it("no text → zero sections + a warning (never fabricated)", () => {
        const r = detectDocumentStructure(null);
        expect(r.sections).toEqual([]);
        expect(r.warnings.length).toBeGreaterThan(0);
        expect(detectDocumentStructure("   ").sections).toEqual([]);
    });

    it("simple labelled text → sections + field candidates with suggested types", () => {
        const text = [
            "FAMILY INFORMATION",
            "Parent Name: ______",
            "Email: ______",
            "Date of Birth: __/__/____",
            "SIGNATURE",
            "Signature: ______",
        ].join("\n");
        const r = detectDocumentStructure(text);
        expect(r.sections.length).toBeGreaterThanOrEqual(1);
        const fields = r.sections.flatMap((s) => s.fields);
        const byLabel = Object.fromEntries(fields.map((f) => [f.label.toLowerCase(), f]));
        expect(byLabel["parent name"]?.suggested_type).toBe("text");
        expect(byLabel["email"]?.suggested_type).toBe("text");
        expect(byLabel["date of birth"]?.suggested_type).toBe("date");
        expect(byLabel["signature"]?.suggested_type).toBe("signature");
        // sections with no fields are dropped → every section has ≥1 field
        expect(r.sections.every((s) => s.fields.length > 0)).toBe(true);
    });

    it("text present but no labelled fields → empty sections + warning", () => {
        const r = detectDocumentStructure("This is a paragraph of prose with no labelled prompts whatsoever.");
        expect(r.sections).toEqual([]);
        expect(r.warnings.some((w) => /no labelled fields/i.test(w))).toBe(true);
    });
});

// --- text extraction stub --------------------------------------------------------------

function fakeDocSupabase(row: { extracted_text?: string | null; mime_type?: string | null } | null) {
    return {
        from() {
            return {
                select() {
                    return { eq() { return { eq() { return { maybeSingle: async () => ({ data: row, error: null }) }; } }; } };
                },
            };
        },
    } as unknown as SupabaseClient;
}

describe("extractDocumentTextSafe — honest availability, never throws", () => {
    it("returns text when documents.extracted_text is populated", async () => {
        const r = await extractDocumentTextSafe(fakeDocSupabase({ extracted_text: "Hello", mime_type: "application/pdf" }), {
            orgId: "o1",
            documentId: "d1",
        });
        expect(r).toEqual({ available: true, text: "Hello", reason: null });
    });

    it("PDF with no text → no_text_extractor_installed (extraction not wired)", async () => {
        const r = await extractDocumentTextSafe(fakeDocSupabase({ extracted_text: null, mime_type: "application/pdf" }), {
            orgId: "o1",
            documentId: "d1",
        });
        expect(r.available).toBe(false);
        expect(r.reason).toBe("no_text_extractor_installed");
    });

    it("missing document → document_not_found; never throws", async () => {
        const r = await extractDocumentTextSafe(fakeDocSupabase(null), { orgId: "o1", documentId: "d1" });
        expect(r.available).toBe(false);
        expect(r.reason).toBe("document_not_found");
    });
});

// --- persistence: metadata only, no form row ------------------------------------------

function makeFakeSupabase(existingMetadata: Record<string, unknown> = {}) {
    const updates: { table: string; payload: Record<string, unknown> }[] = [];
    let inserted = false;
    const supabase = {
        from(table: string) {
            if (table !== "processing_cases") throw new Error(`preview must not touch table "${table}"`);
            return {
                select() {
                    return { eq() { return { eq() { return { maybeSingle: async () => ({ data: { metadata: existingMetadata }, error: null }) }; } }; } };
                },
                update(payload: Record<string, unknown>) {
                    updates.push({ table, payload });
                    return { eq() { return { eq: async () => ({ error: null }) }; } };
                },
                insert() { inserted = true; throw new Error("preview must not insert"); },
            };
        },
    } as unknown as SupabaseClient;
    return { supabase, updates, get inserted() { return inserted; } };
}

describe("dbStoreDocumentFormPreview — metadata only, no form, no status/case_type", () => {
    it("writes ONLY metadata.document_form_preview; preserves siblings; no insert", async () => {
        const fake = makeFakeSupabase({ classification: { classification_key: "subsidy_contract" }, extraction: { x: 1 } });
        const preview = toStoredDocumentFormPreview(detectDocumentStructure("Name: ___"), {
            sourceDocumentId: "doc-1",
            extractedTextAvailable: true,
            now: new Date("2026-06-17T09:00:00.000Z"),
        });
        await dbStoreDocumentFormPreview(fake.supabase, { orgId: "o1", caseId: "c1", preview });

        expect(fake.updates).toHaveLength(1);
        const payload = fake.updates[0].payload;
        expect(Object.keys(payload)).toEqual(["metadata"]);
        expect("case_type" in payload).toBe(false);
        expect("status" in payload).toBe(false);
        const meta = payload.metadata as Record<string, unknown>;
        expect(meta.classification).toEqual({ classification_key: "subsidy_contract" });
        expect(meta.extraction).toEqual({ x: 1 });
        expect((meta.document_form_preview as { generator_version: string }).generator_version).toBe(STRUCTURE_GENERATOR_VERSION);
        expect(fake.inserted).toBe(false);
    });
});

describe("maybeBuildDocumentFormPreviewSafe — best-effort", () => {
    it("stores an honest empty preview when no text is available", async () => {
        // documents read returns no text; processing_cases update captured.
        const captured: { table: string; payload: Record<string, unknown> }[] = [];
        const supabase = {
            from(table: string) {
                if (table === "documents") {
                    return { select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: { extracted_text: null, mime_type: "application/pdf" }, error: null }) }; } }; } }; } };
                }
                if (table === "processing_cases") {
                    return {
                        select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: { metadata: {} }, error: null }) }; } }; } }; },
                        update(payload: Record<string, unknown>) { captured.push({ table, payload }); return { eq() { return { eq: async () => ({ error: null }) }; } }; },
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        } as unknown as SupabaseClient;

        const stored = await maybeBuildDocumentFormPreviewSafe(supabase, { orgId: "o1", caseId: "c1", documentId: "doc-1" });
        expect(stored?.extracted_text_available).toBe(false);
        expect(stored?.sections).toEqual([]);
        expect(stored?.warnings.some((w) => w.startsWith("text_unavailable:"))).toBe(true);
        // metadata-only write, no form row created
        expect(captured).toHaveLength(1);
        expect(Object.keys(captured[0].payload)).toEqual(["metadata"]);
    });

    it("never throws; returns null on db failure (upload unaffected)", async () => {
        const exploding = { from() { throw new Error("db down"); } } as unknown as SupabaseClient;
        const out = await maybeBuildDocumentFormPreviewSafe(exploding, { orgId: "o1", caseId: "c1", documentId: "doc-1" });
        expect(out).toBeNull();
    });
});

describe("parseStoredDocumentFormPreview", () => {
    it("round-trips a stored preview", () => {
        const preview = toStoredDocumentFormPreview(detectDocumentStructure("Name: ___"), {
            sourceDocumentId: "doc-1",
            extractedTextAvailable: true,
            now: new Date("2026-06-17T09:00:00.000Z"),
        });
        expect(parseStoredDocumentFormPreview({ document_form_preview: preview, classification: { k: 1 } })).toEqual(preview);
    });
    it("null when absent/malformed", () => {
        expect(parseStoredDocumentFormPreview({})).toBeNull();
        expect(parseStoredDocumentFormPreview(null)).toBeNull();
        expect(parseStoredDocumentFormPreview({ document_form_preview: { warnings: [] } })).toBeNull();
    });
});
