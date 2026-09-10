import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { chooseDraftForCase } from "@/lib/pos/processingCase/formDraft/buildFormDraftForCaseSafe";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { buildFidelityMappingFromDraft } from "@/lib/pos/processingCase/formDraft/buildFidelityMappingFromDraft";
import { parseFidelityPdfMapping } from "@/lib/forms/pdf/fidelityMappingContract";
import { extractPdfAcroFormFields } from "@/lib/pos/processingCase/structure/pdfAcroForm";

/**
 * IMPORT ALREADY KNEW WHERE EVERY ANSWER GOES ON THE PAGE.
 *
 * The Northwind enrollment application is a fillable PDF: twenty widgets, each with a native name,
 * a page and a rectangle. All of it survived extraction and review, and materialization threw it
 * away — so a Form generated from a school's own paperwork could ask every question on that
 * paperwork and never render it back. These tests pin the bridge that keeps it.
 */

const PDF =
    "/private/tmp/claude-501/-Users-vacilando-Code-alloy-worktrees-wt4-enrollment-phase2-participant-anchor/6c841e87-778e-414b-a1ed-23adbaf3e0fd/scratchpad/paperwork/pkg-01-enrollment-application.pdf";

const SOURCE = { sourceDocumentId: "3f1d9f1e-0c5a-4a1e-9b7c-2f0f6a1d4e77", sourceSha256: "a".repeat(64) };
const maybe = existsSync(PDF) ? describe : describe.skip;

maybe("the Northwind application maps onto its own pages", () => {
    async function build() {
        const draft = await chooseDraftForCase({
            sourceDocumentId: SOURCE.sourceDocumentId,
            fileName: "Northwind Enrollment Application v3",
            classificationKey: "enrollment_document",
            text: { available: false, text: null, reason: "no_extracted_text" },
            pdfBytes: new Uint8Array(readFileSync(PDF)),
            mimeType: "application/pdf",
            extractAcroForm: extractPdfAcroFormFields,
        });
        return { draft, schema: draftFormToFormSchemaV1(draft), mapping: buildFidelityMappingFromDraft(draft, SOURCE) };
    }

    it("produces a mapping the canonical parser accepts", async () => {
        const { mapping } = await build();
        // The contract's own parser is the judge — a shape it rejects is not a mapping.
        expect(parseFidelityPdfMapping(mapping)).not.toBeNull();
        expect(mapping!.engine).toBe("fidelity_v1");
        expect(mapping!.source_document_id).toBe(SOURCE.sourceDocumentId);
    });

    it("points every widget at a question that exists in the schema", async () => {
        const { schema, mapping } = await build();
        const ids = new Set(schema.fields.map((f) => f.id));
        const entries = Object.entries(mapping!.acro_fields);
        expect(entries.length).toBeGreaterThan(10);
        for (const [widget, target] of entries) {
            expect(widget).toBeTruthy();
            // A location naming a field the schema does not have would render nothing, silently.
            expect(ids.has(target.field_id)).toBe(true);
        }
    });

    it("uses the document's own widget names, not invented ones", async () => {
        const { mapping } = await build();
        // These are the names in the PDF itself.
        expect(Object.keys(mapping!.acro_fields)).toEqual(
            expect.arrayContaining(["child_first_name", "child_date_of_birth", "guardian_full_name", "emergency_contact_name"]),
        );
    });

    it("gives the signature a placement rather than a value destination", async () => {
        const { schema, mapping } = await build();
        const signature = schema.fields.find((f) => f.type === "signature");
        expect(signature).toBeTruthy();
        // The engine cannot SET a signature widget — it draws the mark — so it must not be asked to.
        expect(Object.values(mapping!.acro_fields).some((t) => t.field_id === signature!.id)).toBe(false);
        const placement = mapping!.signature_placements.find((p) => p.field_id === signature!.id);
        expect(placement).toBeTruthy();
        // Pages are 0-based in the contract and 1-based on the draft.
        expect(placement!.page).toBe(0);
        expect(placement!.width).toBeGreaterThan(0);
        expect(placement!.height).toBeGreaterThan(0);
    });

    it("adds no geometry to the Form schema", async () => {
        const { schema } = await build();
        // Forms stays the semantic authority. Coordinates live in the mapping, and nowhere else.
        const serialized = JSON.stringify(schema);
        expect(serialized).not.toContain("bbox");
        expect(serialized).not.toContain("pdf_field_name");
    });

    it("copies none of the document's own text into the schema", async () => {
        const { schema } = await build();
        // The recognizable document is the original bytes. Duplicating its prose into text_blocks
        // would make the copy compete with the original for authority.
        expect(schema.fields.some((f) => f.type === "text_block")).toBe(false);
    });
});

describe("a document with nothing to fill backs no mapping", () => {
    it("returns null rather than an empty map", () => {
        const draft = {
            source_document_id: "d",
            title: "Scanned letter",
            fields: [{ id: "field_1", label: "Child name", type: "text", required: false, confidence: "low", evidence: "text" }],
            sections: [{ id: "s1", title: "Body", field_ids: ["field_1"] }],
        } as never;
        // A flat or scanned source has no widgets, so there is no original to render into. That is a
        // perfectly good Form; it simply is not a fidelity one.
        expect(buildFidelityMappingFromDraft(draft, SOURCE)).toBeNull();
    });
});

describe("a version is its schema AND its document", () => {
    it("continues a published version by cloning it, so the mapping travels", () => {
        /*
         * The builder made the next draft by re-posting the published schema, and the versions route
         * defaults `pdf_mapping_json` to null when the body omits it. So publishing an imported Form
         * and opening it once produced a draft that could no longer render its own paperwork —
         * silently, because the questions were all still there.
         */
        const api = readFileSync(join(process.cwd(), "app", "adminV2", "pos", "useProcessingFormApi.ts"), "utf8");
        expect(api).toContain("clone_from_version_id: latest.id");
        expect(api).not.toContain("JSON.stringify({ schema_json: parsed.data })");

        const route = readFileSync(
            join(process.cwd(), "app", "api", "admin", "forms", "[formId]", "versions", "route.ts"),
            "utf8",
        );
        // The clone carries the source document forward; an explicit body value still wins.
        expect(route).toContain("clonedPdfMapping = (src as { pdf_mapping_json?: unknown }).pdf_mapping_json ?? null");
        expect(route).toContain("body.pdf_mapping_json === undefined ? clonedPdfMapping");
    });
});
