import { readFileSync, existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { chooseDraftForCase } from "@/lib/pos/processingCase/formDraft/buildFormDraftForCaseSafe";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { extractPdfAcroFormFields } from "@/lib/pos/processingCase/structure/pdfAcroForm";

/**
 * THE REAL PAPERWORK, END TO END, WITH NO SERVER.
 *
 * `chooseDraftForCase` → `draftFormToFormSchemaV1` is the whole materialization path from PDF bytes
 * to the schema a native Form is created from, and all of it is pure. So the two quality defects
 * can be pinned against the ACTUAL enrollment application rather than a fixture that agrees with
 * me: twenty AcroForm widgets, one emergency contact, one guardian, one signature.
 *
 * The fixture lives in the session scratchpad, not the repo, so this skips when it is absent and
 * the browser proof carries the case instead.
 */

const PDF =
    "/private/tmp/claude-501/-Users-vacilando-Code-alloy-worktrees-wt4-enrollment-phase2-participant-anchor/6c841e87-778e-414b-a1ed-23adbaf3e0fd/scratchpad/paperwork/pkg-01-enrollment-application.pdf";

const maybe = existsSync(PDF) ? describe : describe.skip;

maybe("the Northwind enrollment application materializes into a shippable form", () => {
    async function materialize() {
        const bytes = new Uint8Array(readFileSync(PDF));
        const draft = await chooseDraftForCase({
            sourceDocumentId: "test-doc",
            fileName: "Northwind Enrollment Application v3",
            classificationKey: "enrollment_document",
            text: { available: false, text: null, reason: "no_extracted_text" },
            pdfBytes: bytes,
            mimeType: "application/pdf",
            extractAcroForm: extractPdfAcroFormFields,
        });
        return { draft, schema: draftFormToFormSchemaV1(draft) };
    }

    it("does not open by reciting the questions it is about to ask", async () => {
        const { schema } = await materialize();
        const blocks = schema.fields.filter((f) => f.type === "text_block");
        const asked = schema.fields
            .filter((f) => f.type !== "text_block")
            .map((f) => (f.label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
        for (const block of blocks) {
            const lines = String((block as { content?: string }).content ?? "")
                .split(/\n+/)
                .map((l) => l.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
                .filter(Boolean);
            // A block may legitimately carry prose. It may not restate a question asked beside it.
            for (const line of lines) expect(asked).not.toContain(line);
        }
    });

    it("asks for the one emergency contact once, and does not lose their phone or relationship", async () => {
        const { schema } = await materialize();
        const labels = schema.fields.map((f) => f.label ?? "");
        const emergency = labels.filter((l) => /emergency/i.test(l));

        // The source PDF has exactly three emergency-contact widgets: name, relationship, phone.
        // All three survive as themselves. The detector path asks the name once and does not split
        // it; the operator review path splits it into first/last exactly once. Neither may drop the
        // relationship or the phone, and neither may ask anything twice.
        expect(emergency.some((l) => /name/i.test(l))).toBe(true);
        expect(emergency.some((l) => /relationship/i.test(l))).toBe(true);
        expect(emergency.some((l) => /phone/i.test(l))).toBe(true);
        expect(emergency.filter((l) => /first name/i.test(l)).length).toBeLessThanOrEqual(1);
        expect(emergency.filter((l) => /last name/i.test(l)).length).toBeLessThanOrEqual(1);
        // Every emergency question is distinguishable from every other.
        expect(new Set(emergency).size).toBe(emergency.length);
    });

    it("never routes the emergency contact onto the guardian's canonical fields", async () => {
        const { schema } = await materialize();
        for (const f of schema.fields) {
            if (!/emergency/i.test(f.label ?? "")) continue;
            const key = (f as { field_source?: { field_key?: string } }).field_source?.field_key ?? null;
            expect(key).not.toBe("guardian_first_name");
            expect(key).not.toBe("guardian_last_name");
        }
    });

    it("asks no question twice", async () => {
        const { schema } = await materialize();
        const asked = schema.fields.filter((f) => f.type !== "text_block").map((f) => f.label ?? "");
        expect(new Set(asked).size).toBe(asked.length);
    });
});
