import type { FormSchemaV1 } from "@/lib/forms/schema";

/** Minimal valid schema for a brand-new admin form draft — empty section, no auto-seeded fields. */
export function emptyFormSchema(title: string): FormSchemaV1 {
    const t = title.trim() || "Untitled form";
    return {
        schema_version: 1,
        title: t,
        sections: [{ id: "main", title: "Questions", field_ids: [] }],
        fields: [],
    };
}
