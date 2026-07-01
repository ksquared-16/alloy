/**
 * Dot-path lookup on an object (e.g. "job.id" -> payload.job.id).
 */
export function getByPath(obj: unknown, path: string): unknown {
    if (!path) return obj;
    const parts = path.split(".");
    let cur: unknown = obj;
    for (const p of parts) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
}

/**
 * Replace {{dot.path}} tokens in templateString with values from eventPayload.
 * Missing paths become empty string.
 */
export function renderTemplate(templateString: string, eventPayload: Record<string, unknown>): string {
    if (typeof templateString !== "string") return "";
    return templateString.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
        const trimmed = path.trim();
        const val = getByPath(eventPayload, trimmed);
        if (val == null) return "";
        return String(val);
    });
}
