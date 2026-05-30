import { normalizeOptionsFromConfig, type FieldOption } from "@/lib/fields/fieldDefinitionConfig";

type FieldDefRow = {
    field_key?: string;
    field_type?: string;
    config?: unknown;
};

/** Config-driven gender select options from person `_field_definitions`. */
const DEFAULT_PERSON_GENDER_OPTIONS: FieldOption[] = [
    { value: "female", label: "Female" },
    { value: "male", label: "Male" },
    { value: "non_binary", label: "Non-binary" },
    { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export function personDrawerGenderSelectOptions(record: Record<string, unknown>): FieldOption[] {
    const defs = (record._field_definitions as FieldDefRow[] | undefined) ?? [];
    const def = defs.find((d) => String(d.field_key ?? "").trim() === "gender");
    const fromConfig = def ? normalizeOptionsFromConfig(def.config) : [];
    return fromConfig.length > 0 ? fromConfig : DEFAULT_PERSON_GENDER_OPTIONS;
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
