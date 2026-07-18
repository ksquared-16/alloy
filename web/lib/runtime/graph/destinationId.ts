/**
 * Operational Graph — Destination Identity (Phase A · §1.3 of
 * docs/platform/runtime/workspace-operational-preparation-runtime.md).
 *
 * A **destination** is a path to a leaf-or-intermediate operational state. Its identity is the
 * explicit, stable tuple:
 *
 *     DestinationId = (workUnitId, workViewId, subjectId | null, focusMode | null)
 *
 *   - `workUnitId` + `workViewId` map to the provisioning `AttentionRef(target, lens)`.
 *   - `subjectId`  is the committed Record of Attention (null = "use the Work View's
 *                  default-subject strategy", resolved at prepare time and pinned once known).
 *   - `focusMode`  is the Focus-Panel mode (null = the configured primary mode).
 *
 * This id is the Prepared Destination store key AND the K2 resource key — one identity, one
 * canonical path (§Invariant 4). Because the id is content-addressed on the compiling graph
 * revision (§1.4), two operators — or the same operator before/after a publish — never collide on
 * a stale composition.
 *
 * Pure module: no I/O, no time, no environment. Safe to compile on server or client.
 */

/** A Focus-Panel mode key (e.g. "work", "activity"). `null` = the configured primary mode. */
export type FocusMode = string;

export type DestinationId = {
    workUnitId: string;
    workViewId: string;
    /** Committed Record of Attention; `null` = resolve the Work View's default-subject strategy. */
    subjectId: string | null;
    /** Focus-Panel mode; `null` = the configured primary mode. */
    focusMode: FocusMode | null;
};

/** Sentinel a segment collapses to when its value is `null` (distinct from any encoded value). */
const NULL_SEGMENT = "∅"; // ∅

/**
 * Serialize a DestinationId to a compact, stable, reversible store key.
 *
 * Each segment is `encodeURIComponent`-escaped so an id containing the field delimiter can never
 * forge a different identity. The key is order-stable and content-addressed — identical tuples
 * always produce identical keys, and no two distinct tuples collide.
 */
export function destinationIdKey(id: DestinationId): string {
    const seg = (v: string | null): string => (v === null ? NULL_SEGMENT : encodeURIComponent(v));
    return [
        `wu:${encodeURIComponent(id.workUnitId)}`,
        `wv:${encodeURIComponent(id.workViewId)}`,
        `s:${seg(id.subjectId)}`,
        `m:${seg(id.focusMode)}`,
    ].join("|");
}

/** Parse a key produced by {@link destinationIdKey}. Returns `null` for a malformed key. */
export function parseDestinationIdKey(key: string): DestinationId | null {
    const parts = key.split("|");
    if (parts.length !== 4) return null;
    const [wuPart, wvPart, sPart, mPart] = parts;
    if (!wuPart.startsWith("wu:") || !wvPart.startsWith("wv:")) return null;
    if (!sPart.startsWith("s:") || !mPart.startsWith("m:")) return null;
    const decode = (raw: string): string | null =>
        raw === NULL_SEGMENT ? null : decodeURIComponent(raw);
    const workUnitId = decodeURIComponent(wuPart.slice(3));
    const workViewId = decodeURIComponent(wvPart.slice(3));
    if (!workUnitId || !workViewId) return null;
    return {
        workUnitId,
        workViewId,
        subjectId: decode(sPart.slice(2)),
        focusMode: decode(mPart.slice(2)),
    };
}

export function destinationIdEquals(a: DestinationId, b: DestinationId): boolean {
    return (
        a.workUnitId === b.workUnitId &&
        a.workViewId === b.workViewId &&
        a.subjectId === b.subjectId &&
        a.focusMode === b.focusMode
    );
}

/**
 * The **node identity** of a destination — its (workUnitId, workViewId) address, ignoring the
 * subject/mode that fill it. Two destinations that differ only by subject or mode share one
 * graph node; this is the key the Operational Graph enumerates (§1.1).
 */
export function destinationNodeKey(id: Pick<DestinationId, "workUnitId" | "workViewId">): string {
    return `wu:${encodeURIComponent(id.workUnitId)}|wv:${encodeURIComponent(id.workViewId)}`;
}

/** Pin a subject onto a destination (default-subject resolved at prepare time → concrete id). */
export function withSubject(id: DestinationId, subjectId: string | null): DestinationId {
    return { ...id, subjectId };
}

/** Select a Focus-Panel mode on a destination. */
export function withFocusMode(id: DestinationId, focusMode: FocusMode | null): DestinationId {
    return { ...id, focusMode };
}

/** Construct a node-level destination (subject + mode unresolved) for a (workUnit, workView) pair. */
export function nodeDestinationId(workUnitId: string, workViewId: string): DestinationId {
    return { workUnitId, workViewId, subjectId: null, focusMode: null };
}
