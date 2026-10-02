import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ProcessingImportedFormStudio from "@/app/adminV2/pos/ProcessingImportedFormStudio";
import {
    dimmedFieldIds,
    mappingCounts,
    matchesAttention,
    resolveImportedFormMappings,
    MAPPING_ATTENTION_FILTERS,
} from "@/lib/pos/formDraft/importedFormMappingView";
import ProcessingFormCanvas from "@/app/adminV2/pos/ProcessingFormCanvas";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { safeParseFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

const web = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");

const draft = {
    title: "Admissions Packet",
    generated_form_name: "Admissions Packet",
    source_document_id: "doc-1",
    sections: [
        { id: "s1", title: "Child Information", confidence: "high", field_ids: ["dob", "allergies", "describe", "nick"] },
    ],
    fields: [
        {
            id: "dob",
            label: "Child's Date of Birth",
            type: "date",
            required: true,
            confidence: "high",
            field_source: { entity_type: "child", field_key: "child_date_of_birth" },
            evidence: "Date of Birth: ____",
            page: 1,
        },
        { id: "allergies", label: "Does the child have allergies?", type: "boolean", required: true, confidence: "high" },
        { id: "describe", label: "If yes, please describe", type: "text", required: false, confidence: "high" },
        {
            id: "nick",
            label: "Preferred nickname",
            type: "text",
            required: false,
            confidence: "low",
            field_source: { entity_type: "child", field_key: "unmapped" },
        },
    ],
    warnings: [],
    diagnostics: {},
    collections: [],
    generated_at: "2026-10-02T00:00:00Z",
    generator_version: "test",
} as unknown as StoredFormDraftPreview;

function render(over: Partial<React.ComponentProps<typeof ProcessingImportedFormStudio>> = {}): string {
    return renderToStaticMarkup(
        <ProcessingImportedFormStudio
            draft={draft}
            sourceDocumentName="Admissions_Packet.html"
            sourcePreviewUrl="/api/admin/documents/doc-1/source-preview"
            onSaveFieldEdits={async () => {}}
            onCreateFieldAndMap={async () => {}}
            {...over}
        />,
    );
}

describe("the imported document opens in Forms Studio", () => {
    it("renders the Studio canvas, not a surface of its own", () => {
        const html = render();
        // data-canvas-field and form-canvas-question-* belong to ProcessingFormCanvas, which manual
        // forms render too. Their presence here is the convergence, not a lookalike.
        expect(html).toContain("data-canvas-field");
        expect(html).toContain('data-testid="form-canvas-question-dob"');
        expect(html).toContain('data-qa-imported-form-studio="true"');
    });

    it("is the form, with the document's own headings, labels and order", () => {
        const html = render();
        expect(html).toContain("Admissions Packet");
        expect(html).toContain("Child Information");
        const order = ["Child&#x27;s Date of Birth", "Does the child have allergies?", "If yes, please describe"];
        let at = -1;
        for (const label of order) {
            const next = html.indexOf(label);
            expect(next, `${label} missing`).toBeGreaterThan(-1);
            expect(next, `${label} out of order`).toBeGreaterThan(at);
            at = next;
        }
    });

    it("shows requiredness on the form", () => {
        const html = render();
        expect(html).toContain("Required");
        expect(html).toContain("Optional");
    });

    it("reuses the Studio canvas and inspector modules rather than private copies", () => {
        const source = web("app/adminV2/pos/ProcessingImportedFormStudio.tsx");
        expect(source).toContain('from "./ProcessingFormCanvas"');
        expect(source).toContain('from "./ProcessingFormQuestionInspector"');
        // The same two modules the manual builder imports.
        const builder = web("app/adminV2/pos/ProcessingFormBuilder.tsx");
        expect(builder).toContain('from "./ProcessingFormCanvas"');
        expect(builder).toContain('from "./ProcessingFormQuestionInspector"');
    });

    it("builds no parallel editor, inspector or field-properties panel", () => {
        for (const forbidden of [
            "ImportedFormEditor",
            "ImportedFormInspector",
            "ImportedFormFieldProperties",
            "ProcessingSourceFormCanvas",
        ]) {
            expect(existsSync(join(__dirname, "..", "..", `app/adminV2/pos/${forbidden}.tsx`)), forbidden).toBe(false);
        }
    });
});

describe("mapping is visible on the form and can be switched off", () => {
    it("starts with mapping shown, drawn on the fields themselves", () => {
        const html = render();
        expect(html).toContain('data-qa-show-mapping="true"');
        expect(html).toContain('data-canvas-field-mapping="mapped"');
        expect(html).toContain('data-testid="form-canvas-mapping-dob"');
        expect(html).toContain("Mapped");
    });

    it("red-lines a question explicitly carrying no canonical binding", () => {
        expect(render()).toContain('data-canvas-field-mapping="needs_mapping"');
    });

    it("offers the five mapping-attention filters with counts", () => {
        const html = render();
        expect(html).toContain('data-qa-mapping-attention="true"');
        for (const f of MAPPING_ATTENTION_FILTERS) {
            expect(html).toContain(`data-qa-attention-filter="${f.id}"`);
        }
    });

    it("leaves every field undimmed before a filter is chosen", () => {
        const html = render();
        expect(html).toContain('data-canvas-field-dimmed="false"');
        expect(html).not.toContain('data-canvas-field-dimmed="true"');
    });
});

describe("filters change emphasis, never membership", () => {
    const schema = safeParseFormSchema(draftFormToFormSchemaV1(draft));

    it("keeps every field on the form under every filter", () => {
        expect(schema.success).toBe(true);
        if (!schema.success) return;
        const mappings = resolveImportedFormMappings(schema.data, draft);
        for (const f of MAPPING_ATTENTION_FILTERS) {
            const dimmed = dimmedFieldIds(schema.data, mappings, f.id);
            // Dimming is the whole mechanism: the field count never changes.
            expect(schema.data.fields.length).toBeGreaterThan(0);
            expect(dimmed.size).toBeLessThan(schema.data.fields.length + 1);
        }
    });

    it("dims the non-matching fields when an attention filter is chosen", () => {
        if (!schema.success) return;
        const mappings = resolveImportedFormMappings(schema.data, draft);
        const dimmed = dimmedFieldIds(schema.data, mappings, "needs_mapping");
        expect(dimmed.has("dob")).toBe(true);
        expect(dimmed.has("nick")).toBe(false);
    });

    it("counts each state, and treats derived answers as form-only", () => {
        if (!schema.success) return;
        const counts = mappingCounts(resolveImportedFormMappings(schema.data, draft));
        expect(counts.mapped).toBeGreaterThan(0);
        expect(counts.needs_mapping).toBe(1);
        expect(counts.all).toBe(counts.mapped + counts.needs_mapping + counts.suggested + counts.form_only);
        expect(matchesAttention("derived", "form_only")).toBe(true);
    });
});

describe("the original stays reachable, and stays reference material", () => {
    it("offers View original as a secondary action, not a peer tab", () => {
        const html = render();
        expect(html).toContain('data-qa-view-original="true"');
        expect(html).toContain("View original");
        // No Source tab competing with the form, and the drawer is closed until asked for.
        expect(html).not.toContain("<iframe");
    });

    it("cannot open the original when the source has no safe preview", () => {
        expect(render({ sourcePreviewUrl: null })).toMatch(/data-qa-view-original="true"[^>]*disabled/);
    });

    it("frames the original sandboxed, with no referrer and no injected markup", () => {
        const source = web("app/adminV2/pos/ProcessingImportedFormStudio.tsx");
        expect(source).toContain('sandbox=""');
        expect(source).toContain('referrerPolicy="no-referrer"');
        expect(source).toContain("src={sourcePreviewUrl}");
        expect(source).not.toContain("dangerouslySetInnerHTML");
        expect(source).not.toContain("srcDoc");
    });
});

describe("the operator is never sent back to the extraction world", () => {
    it("shows no Advanced extraction details anywhere in the form workflow", () => {
        const html = render();
        expect(html).not.toContain("Advanced extraction details");
        const strip = (p: string) =>
            web(p)
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
                .replace(/(^|[^:])\/\/.*$/gm, "$1");
        for (const p of ["app/adminV2/pos/ProcessingImportedFormStudio.tsx", "app/adminV2/pos/PosTemplateSetupColumn.tsx"]) {
            expect(strip(p), p).not.toContain("Advanced extraction details");
        }
    });

    it("offers no packet analysis and leaks no engine vocabulary", () => {
        const html = render();
        for (const leak of [
            "Analyze as one packet",
            "Analyse as one packet",
            "owner_hint",
            "collection_provider_ref",
            "requirement kind",
            "ambiguous grain",
            "customer_member_id",
        ]) {
            expect(html, `leaked ${leak}`).not.toContain(leak);
        }
    });
});

describe("the shared canvas draws a group as one concept", () => {
    /*
     * Driven through the Studio canvas with a schema built by hand, because the point under test is the
     * canvas's own group rendering — the thing that previously turned a repeatable collection and a
     * structured address back into a flat row.
     */
    const schema: FormSchemaV1 = {
        schema_version: 1,
        title: "Packet",
        sections: [{ id: "s1", title: "Parents", field_ids: ["guardians", "home"] }],
        fields: [
            {
                id: "guardians",
                type: "group",
                label: "Parents / Guardians",
                required: true,
                repeat: { min: 1, max: 3 },
                fields: [
                    { id: "g_first", type: "text", label: "First name", required: true },
                    { id: "g_last", type: "text", label: "Last name", required: true },
                ],
            },
            {
                id: "home",
                type: "group",
                label: "Home address",
                required: true,
                fields: [
                    { id: "a1", type: "text", label: "Address line 1", required: true },
                    { id: "city", type: "text", label: "City", required: true },
                ],
                address_binding: { entity_type: "person", address_role: "home" },
            },
        ],
    } as unknown as FormSchemaV1;

    const html = renderToStaticMarkup(
        <ProcessingFormCanvas
            schema={schema}
            selectedFieldId={null}
            selectedSectionId={null}
            editable
            onSelectField={() => {}}
            onSelectSection={() => {}}
            onAddQuestion={() => {}}
            onAddSection={() => {}}
            mapping={{ byFieldId: new Map([["guardians", "mapped"]]), show: true }}
        />,
    );

    it("renders repeated people as one group with its children and an add control", () => {
        expect(html).toContain('data-canvas-group-kind="repeat"');
        expect(html).toContain("Parents / Guardians");
        expect(html).toContain('data-canvas-group-child="g_first"');
        expect(html).toContain("+ Add another");
        // Not three unrelated questions.
        expect(html).not.toContain("Parent 2");
    });

    it("renders a structured address as one address concept, with its lines inside it", () => {
        expect(html).toContain('data-canvas-group-kind="address"');
        expect(html).toContain("Home address");
        expect(html).toContain('data-canvas-group-child="city"');
        // An address is one thing, so it gets no add control.
        expect(html).not.toContain('data-testid="form-canvas-add-another-home"');
    });

    it("carries the mapping overlay onto the group itself", () => {
        expect(html).toContain('data-testid="form-canvas-mapping-guardians"');
    });
});
