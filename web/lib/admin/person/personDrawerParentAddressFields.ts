/** Address field keys for parent operating surface — driven by field_definitions when present. */
export const PERSON_DRAWER_PARENT_ADDRESS_FIELD_SPECS = [
    { key: "address_line1", label: "Address Line 1" },
    { key: "address_line2", label: "Address Line 2" },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    { key: "postal_code", label: "Zip Code" },
] as const;

export type PersonDrawerParentAddressFieldSpec = (typeof PERSON_DRAWER_PARENT_ADDRESS_FIELD_SPECS)[number];

export type PersonDrawerParentAddressField = PersonDrawerParentAddressFieldSpec & {
    configured: boolean;
};

function fieldDefKeys(record: Record<string, unknown>): Set<string> {
    const defs = (record._field_definitions as { field_key?: string }[] | undefined) ?? [];
    return new Set(defs.map((d) => String(d.field_key ?? "").trim()).filter(Boolean));
}

/** Resolve address fields from field_definitions — show row when defined or value exists. */
export function resolvePersonDrawerParentAddressFields(
    record: Record<string, unknown>
): PersonDrawerParentAddressField[] {
    const configured = fieldDefKeys(record);
    return PERSON_DRAWER_PARENT_ADDRESS_FIELD_SPECS.map((spec) => ({
        ...spec,
        configured: configured.has(spec.key) || record[spec.key] != null,
    })).filter((spec) => spec.configured);
}

export const PERSON_DRAWER_PARENT_ADDRESS_FIELD_KEYS = new Set(
    PERSON_DRAWER_PARENT_ADDRESS_FIELD_SPECS.map((s) => s.key)
);
