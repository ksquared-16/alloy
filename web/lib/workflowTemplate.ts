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

/** Fullwidth curly braces sometimes appear in copied workflow JSON; normalize so {{ }} matching works. */
function normalizeTemplateBraces(s: string): string {
    return s.replace(/\uFF5B/g, "{").replace(/\uFF5D/g, "}");
}

/**
 * Resolve {{dot.path}} in a string using eventPayload (with brace normalization + second pass if placeholders remain).
 */
export function renderTemplateForActionLinkMetadata(
    templateString: string,
    eventPayload: Record<string, unknown>
): string {
    if (typeof templateString !== "string") return "";
    const normalized = normalizeTemplateBraces(templateString);
    let out = renderTemplate(normalized, eventPayload);
    if (/\{\{/.test(out)) {
        out = out.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path: string) => {
            const val = getByPath(eventPayload, path.trim());
            if (val == null || val === "") return "";
            return String(val);
        });
    }
    return out;
}

/**
 * Walk create_action_link `metadata` and render every string value (e.g. vendor_id: "{{job.assigned_vendor_id}}").
 * Template-only values that resolve empty become null so DB never stores literal {{...}}.
 */
export function renderActionLinkMetadata(
    metadata: Record<string, unknown> | null | undefined,
    eventPayload: Record<string, unknown>
): Record<string, unknown> {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return {};
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(metadata)) {
        if (typeof v === "string") {
            const hadPlaceholder = /\{\{/.test(normalizeTemplateBraces(v));
            const rendered = renderTemplateForActionLinkMetadata(v, eventPayload);
            out[k] = hadPlaceholder && rendered.trim() === "" ? null : rendered;
        } else if (v != null && typeof v === "object" && !Array.isArray(v)) {
            out[k] = renderActionLinkMetadata(v as Record<string, unknown>, eventPayload);
        } else {
            out[k] = v;
        }
    }
    return out;
}
