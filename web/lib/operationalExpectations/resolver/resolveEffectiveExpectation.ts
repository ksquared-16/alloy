/**
 * Effective Expectation Resolver (P1 · Wave D).
 *
 * A pure fold over the already-shipped append-only `operational_expectations`
 * ledger: injected rows + an as-of coordinate → the EFFECTIVE expectation. It is
 * the internal P1 realization of the ledger read/query surface (Engineering
 * Realization §13). It is NOT the P3 Judgment engine.
 *
 * Frozen behavior realized here (program-owner ratified, this Wave D scope):
 *   - REVISION (System Design §4.3): prior was valid-then → re-plan FORWARD. The
 *     predecessor stays effective for valid-time BEFORE the revision's
 *     valid_from; the revision is effective from its valid_from forward. The
 *     predecessor row is UNCHANGED; the truncated window is derived here.
 *   - CORRECTION (§4.4): prior was NEVER valid → unwind on the current-knowledge
 *     axis. On "as-of-now" the correction replaces the predecessor across the
 *     predecessor's window; on "as-known-at-T" (T before the correction was
 *     authored) the predecessor still resolves (audit).
 *
 * Fail-closed (program-owner ruling): `cancellation` / `replacement` effectivity
 * is UNRATIFIED. If the known horizon of a lineage contains either, the WHOLE
 * lineage fails closed with a typed result — never ignored, never aliased to
 * correction/revision, never partially resolved.
 *
 * Purity: no DB IO, no writes, no system clock. `Date.parse` reads the caller's
 * injected timestamps (an input), never the wall clock.
 */

import { resolveEffectiveStanding } from "@/lib/operationalExpectations/standing/resolveEffectiveStanding";
import {
    RATIFIED_TRANSITIONS,
    type AsOfCoordinate,
    type EffectiveExpectation,
    type EffectiveExpectationQuery,
    type EffectiveExpectationResolution,
    type EffectiveExpectationSetQuery,
    type ExpectationLedgerRow,
} from "@/lib/operationalExpectations/resolver/effectiveExpectationTypes";

// -----------------------------------------------------------------------------
// Time helpers — total, deterministic ordering over injected timestamps.
// -----------------------------------------------------------------------------

const OPEN_END = Number.POSITIVE_INFINITY;

function ms(iso: string): number {
    return Date.parse(iso);
}

function toMs(iso: string | null): number {
    return iso == null ? OPEN_END : ms(iso);
}

/** Effective lineage root — a `create` roots itself; null is treated as own id. */
function lineageRootOf(row: ExpectationLedgerRow): string {
    return row.lineage_root_id ?? row.id;
}

/** Deterministic total order: transaction-time ascending, id as the tiebreak. */
function byAuthoredThenId(a: ExpectationLedgerRow, b: ExpectationLedgerRow): number {
    const am = ms(a.authored_at);
    const bm = ms(b.authored_at);
    if (am !== bm) return am - bm;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// -----------------------------------------------------------------------------
// The effective-window segments the fold builds. `toIso` preserves the derived
// boundary for the result; it is NEVER written back to any row.
// -----------------------------------------------------------------------------

interface Segment {
    row: ExpectationLedgerRow;
    fromMs: number;
    toMs: number;
    fromIso: string;
    toIso: string | null;
}

function pushSegment(list: Segment[], row: ExpectationLedgerRow): void {
    const fromMs = ms(row.valid_from);
    const toMsVal = toMs(row.valid_to);
    if (fromMs >= toMsVal) return; // empty/inverted authored frame contributes nothing
    list.push({ row, fromMs, toMs: toMsVal, fromIso: row.valid_from, toIso: row.valid_to });
}

/** Truncate every live segment to end no later than `boundaryMs` (revision: re-plan forward). */
function truncateAt(list: Segment[], boundaryMs: number, boundaryIso: string): Segment[] {
    const out: Segment[] = [];
    for (const seg of list) {
        if (seg.toMs > boundaryMs) {
            const clippedTo = boundaryMs;
            if (seg.fromMs >= clippedTo) continue; // fully truncated away
            out.push({ ...seg, toMs: clippedTo, toIso: boundaryIso });
        } else {
            out.push(seg);
        }
    }
    return out;
}

/** Remove the corrected predecessor's contribution entirely (correction: never-valid). */
function dropRowSegments(list: Segment[], rowId: string): Segment[] {
    return list.filter((seg) => seg.row.id !== rowId);
}

// -----------------------------------------------------------------------------
// Core single-lineage resolver.
// -----------------------------------------------------------------------------

function normalizeCoordinate(asOf: AsOfCoordinate): { validTime: string; knownAt: string | null } {
    return { validTime: asOf.validTime, knownAt: asOf.knownAt ?? null };
}

/**
 * Resolve the effective expectation for a single lineage from injected rows.
 *
 * Org and lineage isolation are enforced: only rows with `org_id === orgId` and
 * the requested lineage root participate. Rows authored after `knownAt` (when
 * given) are excluded (the as-known-at-T axis).
 */
export function resolveEffectiveExpectation(
    rows: readonly ExpectationLedgerRow[],
    query: EffectiveExpectationQuery,
): EffectiveExpectationResolution {
    const coord = normalizeCoordinate(query.asOf);
    const knownAtMs = coord.knownAt == null ? OPEN_END : ms(coord.knownAt);
    const ratified = query.ratifiedExpectationIds ?? new Set<string>();

    // Org + lineage isolation, then transaction-time horizon (as-known-at-T).
    const scoped = rows.filter(
        (r) =>
            r.org_id === query.orgId &&
            lineageRootOf(r) === query.lineageRootId &&
            ms(r.authored_at) <= knownAtMs,
    );

    if (scoped.length === 0) return { kind: "none" };

    const ordered = [...scoped].sort(byAuthoredThenId);

    // Fail closed FIRST: any unratified transition in the known horizon poisons
    // the whole lineage (never ignored, never partially resolved). The earliest
    // offending act (by the total order) is reported for determinism.
    for (const row of ordered) {
        if (row.transition_type != null && !RATIFIED_TRANSITIONS.has(row.transition_type)) {
            return {
                kind: "unsupported_transition",
                transitionType: row.transition_type,
                expectationId: row.id,
                lineageRootId: query.lineageRootId,
            };
        }
    }

    // Fold the ratified transitions into effective-window segments.
    let segments: Segment[] = [];
    for (const row of ordered) {
        const t = row.transition_type;
        if (t == null) {
            // `create` (or any root act): open its authored window.
            pushSegment(segments, row);
        } else if (t === "revision") {
            // Re-plan forward: prior stays valid until the revision's valid_from.
            segments = truncateAt(segments, ms(row.valid_from), row.valid_from);
            pushSegment(segments, row);
        } else if (t === "correction") {
            // Never-valid unwind: the corrected predecessor's contribution is
            // removed; the correction governs its own frame (retroactive).
            if (row.supersedes_expectation_id != null) {
                segments = dropRowSegments(segments, row.supersedes_expectation_id);
            }
            pushSegment(segments, row);
        }
        // No `else` — cancellation/replacement already failed closed above.
    }

    // Pick the segment covering the requested valid-time (half-open [from, to)).
    const vt = ms(coord.validTime);
    const hit = segments.find((seg) => seg.fromMs <= vt && vt < seg.toMs);
    if (hit == null) return { kind: "none" };

    const effective: EffectiveExpectation = {
        orgId: query.orgId,
        lineageRootId: query.lineageRootId,
        effectiveExpectationId: hit.row.id,
        modality: hit.row.modality,
        authorityKey: hit.row.authority_key,
        authorClass: hit.row.author_class,
        subjectKind: hit.row.subject_kind,
        effectiveStanding: resolveEffectiveStanding(hit.row.standing, ratified.has(hit.row.id)),
        effectiveFrom: hit.fromIso,
        effectiveTo: hit.toIso,
        asOf: coord,
        lineagePath: ordered.map((r) => r.id),
    };
    return { kind: "resolved", effective };
}

/**
 * Set-level resolution: group injected rows by lineage root (within the org) and
 * resolve each independently. Every lineage is isolated; an unsupported
 * transition in one lineage fails only that lineage closed.
 */
export function resolveEffectiveExpectations(
    rows: readonly ExpectationLedgerRow[],
    query: EffectiveExpectationSetQuery,
): Map<string, EffectiveExpectationResolution> {
    const roots: string[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
        if (r.org_id !== query.orgId) continue;
        const root = lineageRootOf(r);
        if (!seen.has(root)) {
            seen.add(root);
            roots.push(root);
        }
    }
    roots.sort();

    const out = new Map<string, EffectiveExpectationResolution>();
    for (const lineageRootId of roots) {
        out.set(
            lineageRootId,
            resolveEffectiveExpectation(rows, {
                orgId: query.orgId,
                lineageRootId,
                asOf: query.asOf,
                ratifiedExpectationIds: query.ratifiedExpectationIds,
            }),
        );
    }
    return out;
}
