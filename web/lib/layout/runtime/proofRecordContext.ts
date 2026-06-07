/**
 * Proof runtime record — relation handles and computed projections (Phase 2).
 *
 * Proof-only shape for layout runtime plan rendering. Operators see handles
 * and labels, never raw FK/UUID values for relationship/reference fields.
 */

/** Resolved relation for proof display (single-hop). */
export type ProofRelationHandle = {
    /** Human-readable entity label (e.g. person name, site name). */
    handle: string;
    entityType?: string;
    /** Field values on the related record, keyed by catalog fieldKey. */
    fields?: Record<string, unknown>;
};

/** Proof record extensions consumed by resolveProofBindingValue. */
export type ProofRuntimeRecord = Record<string, unknown> & {
    _relations?: Record<string, ProofRelationHandle>;
    _computed?: Record<string, unknown>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when a value looks like an opaque id that should not be shown to operators. */
export function isOpaqueIdValue(value: unknown): boolean {
    if (typeof value !== "string") return false;
    const t = value.trim();
    if (!t) return false;
    if (UUID_RE.test(t)) return true;
    if (/^[0-9a-f]{24}$/i.test(t)) return true;
    return false;
}

export function readProofRelation(record: ProofRuntimeRecord, relationKey: string): ProofRelationHandle | null {
    const rel = record._relations?.[relationKey];
    if (!rel || typeof rel !== "object") return null;
    return rel;
}

export function readProofComputed(record: ProofRuntimeRecord, computeKey: string): unknown {
    return record._computed?.[computeKey];
}
