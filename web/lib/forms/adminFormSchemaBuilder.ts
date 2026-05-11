import type { FormSchemaV1 } from "@/lib/forms/schema";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";

/** Minimal valid schema for a brand-new admin form draft (one section, first registry field). */
export function emptyFormSchema(title: string): FormSchemaV1 {
    const t = title.trim() || "Untitled form";
    const starter = OPERATIONAL_FORM_SYSTEM_FIELDS[0]!;
    const f = formFieldFromRegistryEntry(starter, {});
    return {
        schema_version: 1,
        title: t,
        sections: [{ id: "main", title: "Questions", field_ids: [f.id] }],
        fields: [f],
    };
}
