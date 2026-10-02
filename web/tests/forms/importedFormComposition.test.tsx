import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ProcessingFormCanvas from "@/app/adminV2/pos/ProcessingFormCanvas";
import ProcessingFormQuestionInspector from "@/app/adminV2/pos/ProcessingFormQuestionInspector";
import {
    conditionTriggerOf,
    nameCompositionParts,
    setFieldVisibility,
    splitFieldIntoParts,
    suggestsNameComposition,
} from "@/lib/forms/formBuilderSchema";
import { buildDraftSavePayload, buildDraftSavePayloadFromSchema } from "@/lib/pos/formDraft/buildDraftSavePayload";
import { buildManualFormDraft } from "@/lib/pos/processingCase/formDraft/buildManualFormDraft";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { groupFieldsIntoRows } from "@/lib/forms/formRowComposition";
import { safeParseFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

const web = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");

const guardianName: FormSchemaV1 = {
    schema_version: 1,
    title: "Packet",
    sections: [{ id: "s1", title: "Guardians", field_ids: ["gname", "email"] }],
    fields: [
        { id: "gname", type: "text", label: "Parent/Guardian #1 Name", required: true, field_source: { entity_type: "guardian", field_key: "unmapped" } },
        { id: "email", type: "text", label: "Parent email", required: true },
    ],
} as unknown as FormSchemaV1;

describe("one source concept becoming several form fields", () => {
    it("offers to split a person's name printed on one rule", () => {
        expect(suggestsNameComposition({ type: "text", label: "Parent/Guardian #1 Name" })).toBe(true);
    });

    it("does not offer to split a label the document was explicit about", () => {
        for (const label of ["Full name", "Legal name", "Name as it appears on the birth certificate", "First name", "Last name"]) {
            expect(suggestsNameComposition({ type: "text", label }), label).toBe(false);
        }
    });

    it("does not offer to split something that is not a name, or not text", () => {
        expect(suggestsNameComposition({ type: "text", label: "Allergies" })).toBe(false);
        expect(suggestsNameComposition({ type: "date", label: "Name of event" })).toBe(false);
    });

    it("replaces the question with its parts, in place", () => {
        const next = splitFieldIntoParts(guardianName, "gname", nameCompositionParts(guardianName.fields[0]!));
        expect(next.fields.map((f) => f.label)).toEqual([
            "Parent/Guardian #1 first name",
            "Parent/Guardian #1 last name",
            "Parent email",
        ]);
        // No duplicate combined question left behind for the operator to notice and delete.
        expect(next.fields.some((f) => f.label === "Parent/Guardian #1 Name")).toBe(false);
        expect(next.sections[0]!.field_ids).toEqual(["gname__1", "gname__2", "email"]);
    });

    it("gives each part its own canonical destination — never both to the same field", () => {
        const next = splitFieldIntoParts(guardianName, "gname", nameCompositionParts(guardianName.fields[0]!));
        const sources = next.fields.slice(0, 2).map((f) => f.field_source);
        expect(sources[0]).toEqual({ entity_type: "guardian", field_key: "first_name" });
        expect(sources[1]).toEqual({ entity_type: "guardian", field_key: "last_name" });
        expect(sources[0]!.field_key).not.toBe(sources[1]!.field_key);
    });

    it("invents no combined canonical field", () => {
        const next = splitFieldIntoParts(guardianName, "gname", nameCompositionParts(guardianName.fields[0]!));
        for (const f of next.fields) {
            expect(f.field_source?.field_key).not.toBe("full_name");
            expect(f.field_source?.field_key).not.toBe("name");
        }
    });

    it("writes no draft-only provenance onto a part, which would make the form unsaveable", () => {
        // `page`/`bbox` are draft properties the published schema rejects; provenance is re-attached on
        // save from the draft field each part descends from, not copied into the schema.
        const next = splitFieldIntoParts(guardianName, "gname", nameCompositionParts(guardianName.fields[0]!));
        for (const part of next.fields.slice(0, 2)) {
            expect(part).not.toHaveProperty("page");
            expect(part).not.toHaveProperty("bbox");
        }
        expect(safeParseFormSchema(next).success).toBe(true);
    });

    it("places the parts side by side", () => {
        const next = splitFieldIntoParts(guardianName, "gname", nameCompositionParts(guardianName.fields[0]!));
        expect(next.fields[0]!.layout_width).toBe("half");
        expect(next.fields[1]!.layout_width).toBe("half");
    });

    it("refuses a split that is really a rename, or a group", () => {
        expect(splitFieldIntoParts(guardianName, "gname", [{ label: "Only one" }])).toBe(guardianName);
        expect(splitFieldIntoParts(guardianName, "ghost", nameCompositionParts(guardianName.fields[0]!))).toBe(guardianName);
    });

    it("leaves no dangling condition when the replaced question was a trigger", () => {
        // A trigger must exist; eligibility is the inspector's concern, and the clause is still cleared.
        const withCondition = setFieldVisibility(guardianName, "email", { triggerFieldId: "gname", value: "x" });
        const next = splitFieldIntoParts(withCondition, "gname", nameCompositionParts(guardianName.fields[0]!));
        expect(conditionTriggerOf(next.fields.find((f) => f.id === "email")!)).toBeNull();
        expect(safeParseFormSchema(next).success).toBe(true);
    });

    it("is offered in the shared inspector, not an imported-only editor", () => {
        const html = renderToStaticMarkup(
            <ProcessingFormQuestionInspector
                field={guardianName.fields[0]!}
                schema={guardianName}
                editable
                mutate={() => {}}
                onRemove={() => {}}
            />,
        );
        expect(html).toContain("form-builder-split-field");
        expect(html).toContain("Split into first and last name");
        const imported = web("app/adminV2/pos/ProcessingImportedFormStudio.tsx");
        expect(imported).not.toContain("splitFieldIntoParts");
    });

    it("survives the save, because a structural change posts the whole schema", () => {
        const draft = {
            title: "Packet",
            generated_form_name: "Packet",
            source_document_id: "d",
            sections: [{ id: "section_1", title: "Guardians", field_ids: ["gname", "email"], disposition: "fields" }],
            fields: [
                { id: "gname", label: "Parent/Guardian #1 Name", type: "text", required: true, confidence: "high", page: 2, evidence: "hosted_form:f:g1name" },
                { id: "email", label: "Parent email", type: "text", required: true, confidence: "high" },
            ],
        } as unknown as StoredFormDraftPreview;
        const split = splitFieldIntoParts(guardianName, "gname", nameCompositionParts(guardianName.fields[0]!));
        const built = buildDraftSavePayloadFromSchema(draft, split);
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.payload.fields.map((f) => f.label)).toEqual([
            "Parent/Guardian #1 first name",
            "Parent/Guardian #1 last name",
            "Parent email",
        ]);
        expect(built.payload.fields[0]!.field_source).toEqual({ entity_type: "guardian", field_key: "first_name" });
        expect(built.payload.fields[0]!.layout_width).toBe("half");
        // And the rebuild keeps both, with their widths.
        const rebuilt = buildManualFormDraft({
            title: built.payload.title,
            sourceDocumentId: "d",
            fields: built.payload.fields.map((f) => ({ ...f, bbox: undefined })),
            sectionDispositions: [{ title: "Guardians", disposition: "fields" }],
        });
        expect(rebuilt.fields.map((f) => f.layout_width)).toEqual(["half", "half", undefined]);
    });
});

describe("side-by-side layout survives the round trip", () => {
    const draft = {
        title: "Packet",
        generated_form_name: "Packet",
        source_document_id: "d",
        sections: [{ id: "section_1", title: "Child", field_ids: ["field_1", "field_2"], disposition: "fields" }],
        fields: [
            { id: "field_1", label: "First name", type: "text", required: true, confidence: "high", layout_width: "half" },
            { id: "field_2", label: "Last name", type: "text", required: true, confidence: "high", layout_width: "half" },
        ],
    } as unknown as StoredFormDraftPreview;

    it("is carried by the whole-draft payload and the server rebuild", () => {
        const built = buildDraftSavePayload(draft, new Map([["field_1", { required: false }]]));
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.payload.fields.map((f) => f.layout_width)).toEqual(["half", "half"]);
        const rebuilt = buildManualFormDraft({
            title: "Packet",
            sourceDocumentId: "d",
            fields: built.payload.fields.map((f) => ({ ...f, bbox: undefined })),
        });
        expect(rebuilt.fields.map((f) => f.layout_width)).toEqual(["half", "half"]);
    });

    it("reaches the published schema", () => {
        const parsed = safeParseFormSchema(draftFormToFormSchemaV1(draft));
        expect(parsed.success).toBe(true);
        if (!parsed.success) return;
        expect(parsed.data.fields.map((f) => f.layout_width)).toEqual(["half", "half"]);
    });

    it("puts two half fields on one row, and a full field on its own", () => {
        const fieldById = new Map<string, never>();
        const schema = {
            fields: [
                { id: "a", type: "text", label: "First name", required: true, layout_width: "half" },
                { id: "b", type: "text", label: "Last name", required: true, layout_width: "half" },
                { id: "c", type: "text", label: "Notes", required: false },
            ],
        } as unknown as FormSchemaV1;
        for (const f of schema.fields) fieldById.set(f.id, f as never);
        const rows = groupFieldsIntoRows(["a", "b", "c"], fieldById as never);
        expect(rows[0]).toEqual(["a", "b"]);
        expect(rows[1]).toEqual(["c"]);
    });

    it("renders the row on the shared canvas, and lets the design system stack it on a phone", () => {
        const schema = {
            schema_version: 1,
            title: "T",
            sections: [{ id: "s1", title: "Child", field_ids: ["a", "b"] }],
            fields: [
                { id: "a", type: "text", label: "First name", required: true, layout_width: "half" },
                { id: "b", type: "text", label: "Last name", required: true, layout_width: "half" },
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
            />,
        );
        // One row element holding both questions.
        expect(html).toContain('data-testid="form-canvas-row-s1-0"');
        expect(html).not.toContain('data-testid="form-canvas-row-s1-1"');
        // Wrapping is how the row stacks when there is no width for two.
        expect(html).toContain("flex-wrap");
    });

    it("is set from the existing shared inspector, with no imported-only control", () => {
        const inspector = web("app/adminV2/pos/ProcessingFormQuestionInspector.tsx");
        expect(inspector).toContain("form-builder-layout-width");
        expect(inspector).toContain("setFieldLayoutWidth");
        expect(web("app/adminV2/pos/ProcessingImportedFormStudio.tsx")).not.toContain("layout-width");
    });
});
