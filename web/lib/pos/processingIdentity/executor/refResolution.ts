/**
 * Payload reference resolution (D2).
 *
 * Plan operations reference records created by earlier operations using "@opId"
 * placeholders (e.g. link_person_to_household → { person_id: "@p1" }). The
 * executor substitutes them with the concrete record ids produced during this
 * attempt, so dependent results are resolved from real created records.
 */

export type RefMap = Record<string, string>;

export function resolveRefsInValue(value: unknown, refs: RefMap): unknown {
    if (typeof value === "string" && value.startsWith("@")) {
        const key = value.slice(1);
        return refs[key] ?? value;
    }
    if (Array.isArray(value)) return value.map((v) => resolveRefsInValue(v, refs));
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = resolveRefsInValue(v, refs);
        }
        return out;
    }
    return value;
}

export function resolvePayload(payload: Record<string, unknown>, refs: RefMap): Record<string, unknown> {
    return resolveRefsInValue(payload, refs) as Record<string, unknown>;
}

/** True when a payload still contains unresolved "@ref" placeholders. */
export function hasUnresolvedRefs(payload: Record<string, unknown>): boolean {
    const scan = (v: unknown): boolean => {
        if (typeof v === "string") return v.startsWith("@");
        if (Array.isArray(v)) return v.some(scan);
        if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).some(scan);
        return false;
    };
    return scan(payload);
}
