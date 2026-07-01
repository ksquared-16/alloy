function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

/** Unwrap stored JSON shapes (string JSON, nested definition) before normalize/coerce. */
export function unwrapWorkUnitQueueDefinitionRaw(raw: unknown): unknown {
    if (raw == null) return null;
    if (typeof raw === "string") {
        const t = raw.trim();
        if (!t) return null;
        try {
            return unwrapWorkUnitQueueDefinitionRaw(JSON.parse(t));
        } catch {
            return null;
        }
    }
    if (!isPlainObject(raw)) return raw;
    if (isPlainObject(raw.definition)) return raw.definition;
    if (isPlainObject(raw.queue_definition)) return raw.queue_definition;
    return raw;
}
