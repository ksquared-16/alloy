import type { FormSchemaV1 } from "@/lib/forms/schema";

/** Minimal valid schema for a brand-new admin form draft (one section, one placeholder field). */
export function emptyFormSchema(title: string): FormSchemaV1 {
    const t = title.trim() || "Untitled form";
    return {
        schema_version: 1,
        title: t,
        sections: [{ id: "main", title: "Main", field_ids: ["field_1"] }],
        fields: [{ id: "field_1", type: "text", label: "First question", required: false }],
    };
}
