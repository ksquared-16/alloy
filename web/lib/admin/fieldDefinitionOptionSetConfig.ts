/** Read / merge `option_set_key` on field_definitions.config for select-like fields. */

export function getOptionSetKeyFromConfig(config: Record<string, unknown> | null | undefined): string {
    if (!config || typeof config !== "object") return "";
    const v = (config as Record<string, unknown>).option_set_key;
    return typeof v === "string" ? v.trim() : "";
}

export function buildConfigWithOptionSetKey(
    existing: Record<string, unknown> | null | undefined,
    optionSetKey: string
): Record<string, unknown> {
    const base =
        existing != null && typeof existing === "object" && !Array.isArray(existing)
            ? { ...existing }
            : {};
    const k = optionSetKey.trim();
    if (k) {
        base.option_set_key = k;
    } else {
        delete base.option_set_key;
    }
    return base;
}

export function isSelectLikeFieldType(fieldType: string): boolean {
    const t = fieldType.toLowerCase();
    return t === "select" || t === "multiselect";
}
