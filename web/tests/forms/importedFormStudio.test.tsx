import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ProcessingImportedFormStudio from "@/app/adminV2/pos/ProcessingImportedFormStudio";
import {
    filterSchemaForAttention,
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

    it("shows the whole form before a filter is chosen", () => {
        const html = render();
        for (const id of ["dob", "allergies", "describe", "nick"]) {
            expect(html, id).toContain(`data-testid="form-canvas-question-${id}"`);
        }
    });
});

describe("filters change what is shown, and nothing else", () => {
    const parsed = safeParseFormSchema(draftFormToFormSchemaV1(draft));

    it("narrows the rendered form to the matching fields", () => {
        expect(parsed.success).toBe(true);
        if (!parsed.success) return;
        const mappings = resolveImportedFormMappings(parsed.data, draft);
        const needs = filterSchemaForAttention(parsed.data, mappings, "needs_mapping");
        expect(needs.fields.map((f) => f.id)).toEqual(["nick"]);
        expect(needs.fields.some((f) => f.id === "dob")).toBe(false);
    });

    it("hides a section with nothing left in it rather than leaving an empty shell", () => {
        if (!parsed.success) return;
        const mappings = resolveImportedFormMappings(parsed.data, draft);
        const mapped = filterSchemaForAttention(parsed.data, mappings, "mapped");
        for (const section of mapped.sections) expect(section.field_ids.length).toBeGreaterThan(0);
    });

    it("restores the complete form exactly when the operator returns to All", () => {
        if (!parsed.success) return;
        const mappings = resolveImportedFormMappings(parsed.data, draft);
        filterSchemaForAttention(parsed.data, mappings, "needs_mapping");
        const back = filterSchemaForAttention(parsed.data, mappings, "all");
        // Identity, not a reconstruction: All returns the same object it was given.
        expect(back).toBe(parsed.data);
    });

    it("mutates nothing — the source schema is untouched by filtering", () => {
        if (!parsed.success) return;
        const before = JSON.stringify(parsed.data);
        const mappings = resolveImportedFormMappings(parsed.data, draft);
        for (const f of MAPPING_ATTENTION_FILTERS) filterSchemaForAttention(parsed.data, mappings, f.id);
        expect(JSON.stringify(parsed.data)).toBe(before);
    });

    it("preserves field order within a filtered view", () => {
        if (!parsed.success) return;
        const mappings = resolveImportedFormMappings(parsed.data, draft);
        const all = parsed.data.fields.map((f) => f.id);
        const formOnly = filterSchemaForAttention(parsed.data, mappings, "form_only").fields.map((f) => f.id);
        expect(formOnly).toEqual(all.filter((id) => formOnly.includes(id)));
    });

    it("counts with the same rule the filter uses", () => {
        if (!parsed.success) return;
        const mappings = resolveImportedFormMappings(parsed.data, draft);
        const counts = mappingCounts(parsed.data, mappings);
        for (const f of MAPPING_ATTENTION_FILTERS) {
            if (f.id === "all") continue;
            expect(filterSchemaForAttention(parsed.data, mappings, f.id).fields.length, f.id).toBe(counts[f.id]);
        }
        expect(matchesAttention("derived", "form_only")).toBe(true);
    });
});

describe("the source stays reachable, and stays reference material", () => {
    it("offers View original as a secondary action, not a peer tab", () => {
        const html = render();
        expect(html).toContain('data-qa-view-original="true"');
        expect(html).toContain("View original");
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
        expect(html).not.toContain("Parent 2");
    });

    it("renders a structured address as one address concept, with its lines inside it", () => {
        expect(html).toContain('data-canvas-group-kind="address"');
        expect(html).toContain("Home address");
        expect(html).toContain('data-canvas-group-child="city"');
        expect(html).not.toContain('data-testid="form-canvas-add-another-home"');
    });

    it("carries the mapping overlay onto the group itself", () => {
        expect(html).toContain('data-testid="form-canvas-mapping-guardians"');
    });

    it("filters a group by whether it has a canonical placement, and keeps it whole", () => {
        /*
         * A group's placement is its binding: the address group carries address_binding and so reads as
         * Mapped, while a repeatable with no collection binding is a form structure with nowhere
         * canonical to go and reads as kept-with-the-form. Either way it survives as ONE concept —
         * a half-shown address is not an address.
         */
        const mapped = filterSchemaForAttention(schema, new Map(), "mapped");
        expect(mapped.fields.map((f) => f.id)).toEqual(["home"]);
        expect(mapped.fields.every((f) => f.type === "group" && f.fields.length === 2)).toBe(true);

        const formOnly = filterSchemaForAttention(schema, new Map(), "form_only");
        expect(formOnly.fields.map((f) => f.id)).toEqual(["guardians"]);
        expect(formOnly.fields[0]!.type === "group" && formOnly.fields[0]!.fields.length).toBe(2);

        // Neither is a question awaiting a destination.
        expect(filterSchemaForAttention(schema, new Map(), "needs_mapping").fields).toEqual([]);
    });
});
