import { normalizeOptionsFromConfig, type FieldOption } from "@/lib/fields/fieldDefinitionConfig";

type FieldDefRow = {
    field_key?: string;
    field_type?: string;
    config?: unknown;
};

/** Config-driven gender select options from person `_field_definitions`. */
export function personDrawerGenderSelectOptions(record: Record<string, unknown>): FieldOption[] {
    const defs = (record._field_definitions as FieldDefRow[] | undefined) ?? [];
    const def = defs.find((d) => String(d.field_key ?? "").trim() === "gender");
    if (!def) return [];
    return normalizeOptionsFromConfig(def.config);
}

export function personDrawerGenderStoredValue(record: Record<string, unknown>): string {
    for (const key of ["gender", "gender_key"]) {
        const raw = record[key];
        if (raw != null && String(raw).trim() !== "") return String(raw).trim();
    }
    return "";
}

export function personDrawerGenderDisplayLabel(record: Record<string, unknown>): string | null {
    const stored = personDrawerGenderStoredValue(record);
    if (!stored) return null;
    const options = personDrawerGenderSelectOptions(record);
    const match = options.find((o) => o.value === stored || o.label === stored);
    return match?.label ?? stored;
}
