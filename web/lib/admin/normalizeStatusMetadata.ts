/** Coerce status_definitions.metadata for DB writes — never null. */
export function normalizeStatusDefinitionMetadata(raw: unknown): Record<string, unknown> {
    if (raw == null) return {};
    if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return {};
}
