/**
 * POS-FP12 — convert a draft form preview into a real `FormSchemaV1`.
 *
 * Pure. Proves Workflow A is "real": the draft maps cleanly onto the existing form
 * schema (flat fields + sections referencing field ids), with NO new form system. The
 * draft only uses config-free field types, so the result validates against the live
 * zod schema (`validateFormSchema`) — see the tests. This does NOT create or publish a
 * form; it just produces the schema the Forms builder would load.
 */

import type { FormField, FormSchemaV1, FormSection } from "@/lib/forms/schema";
import type { StoredFormDraftPreview } from "./types";

export function draftFormToFormSchemaV1(draft: StoredFormDraftPreview): FormSchemaV1 {
    const fields: FormField[] = draft.fields.map((f) => {
        const base = {
            id: f.id,
            label: f.label,
            required: f.required,
            ...(f.description ? { description: f.description } : {}),
            ...(f.layout_width ? { layout_width: f.layout_width } : {}),
        };
        switch (f.type) {
            case "number":
                return { ...base, type: "number" };
            case "date":
                return { ...base, type: "date" };
            case "boolean":
                return { ...base, type: "boolean" };
            case "file_ref":
                return { ...base, type: "file_ref" };
            case "signature":
                return { ...base, type: "signature" };
            case "text":
            default:
                return { ...base, type: "text" };
        }
    });

    const sections: FormSection[] = draft.sections.map((s) => ({
        id: s.id,
        title: s.title,
        field_ids: s.field_ids,
    }));

    return {
        schema_version: 1,
        title: draft.title || "Untitled form",
        sections,
        fields,
    };
}
