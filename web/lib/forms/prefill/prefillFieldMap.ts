/** Allowed CRM roots for `entity.column` prefill paths (org-scoped lookups). */
export const PREFILL_ENTITY_ROOTS = ["person", "customer", "customer_member", "opportunity", "contact"] as const;
export type PrefillEntityRoot = (typeof PREFILL_ENTITY_ROOTS)[number];

const ROOT_SET = new Set<string>(PREFILL_ENTITY_ROOTS);

/** `customer_member.first_name` — lowercase root + snake_case column */
export const PREFILL_SOURCE_PATH_RE =
    /^(person|customer|customer_member|opportunity|contact)\.([a-z][a-z0-9_]*)$/;

export function parsePrefillFieldMapFromMetadata(raw: unknown): Record<string, string> | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const fid = typeof k === "string" ? k.trim() : "";
        const path = typeof v === "string" ? v.trim() : "";
        if (!fid || !path) continue;
        if (!PREFILL_SOURCE_PATH_RE.test(path)) continue;
        out[fid] = path;
    }
    return Object.keys(out).length ? out : null;
}

export function mergeDefinitionAndLinkPrefillMaps(
    formDefinitionMetadata: Record<string, unknown> | null | undefined,
    linkMetadata: Record<string, unknown> | null | undefined
): Record<string, string> | null {
    const fromForm = parsePrefillFieldMapFromMetadata(formDefinitionMetadata?.prefill_field_map);
    const fromLink = parsePrefillFieldMapFromMetadata(linkMetadata?.prefill_field_map);
    if (!fromForm && !fromLink) return null;
    return { ...(fromForm ?? {}), ...(fromLink ?? {}) };
}

export function filterPrefillMapToKnownFields(
    map: Record<string, string>,
    allowedFieldIds: Set<string>
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [fid, path] of Object.entries(map)) {
        if (allowedFieldIds.has(fid)) out[fid] = path;
    }
    return out;
}

export type ParsePrefillFieldMapBodyResult =
    | { ok: true; map: Record<string, string> | null }
    | { ok: false; message: string };

export function parsePrefillFieldMapBody(raw: unknown): ParsePrefillFieldMapBodyResult {
    if (raw === undefined || raw === null) return { ok: true, map: null };
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, message: "prefill_field_map must be an object" };
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
        const fid = k.trim();
        if (!fid) continue;
        if (typeof v !== "string" || !v.trim()) {
            return { ok: false, message: `prefill_field_map["${fid}"] must be a non-empty string path` };
        }
        const path = v.trim();
        if (!PREFILL_SOURCE_PATH_RE.test(path)) {
            return {
                ok: false,
                message: `prefill_field_map["${fid}"] must match entity.column (${PREFILL_ENTITY_ROOTS.join("|")})`,
            };
        }
        out[fid] = path;
    }
    return { ok: true, map: Object.keys(out).length ? out : null };
}

export function prefillPathRoot(path: string): PrefillEntityRoot | null {
    const m = path.match(PREFILL_SOURCE_PATH_RE);
    const root = m?.[1];
    return root && ROOT_SET.has(root) ? (root as PrefillEntityRoot) : null;
}
