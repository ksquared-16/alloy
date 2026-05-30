/** Human-readable status for global search pills (prefer org status defs, else title-case key). */
export function humanizeGlobalSearchStatusLabel(
    statusKey: string | null | undefined,
    definitionLabels: Map<string, string> | Record<string, string>
): string | null {
    const key = String(statusKey ?? "").trim();
    if (!key) return null;
    const map = definitionLabels instanceof Map ? definitionLabels : new Map(Object.entries(definitionLabels));
    const fromDef = map.get(key)?.trim();
    if (fromDef) return fromDef;
    return key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
