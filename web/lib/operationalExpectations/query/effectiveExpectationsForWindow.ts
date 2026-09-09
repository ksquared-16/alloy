/**
 * The service-day query seam — expectations FOR a window, not expectations
 * handed to a resolver.
 *
 * ── THE MISSING ARCHITECTURE ──
 *
 * `resolveEffectiveExpectations` is a pure fold over rows the caller already
 * has. That is the correct shape for a resolver and useless as a product seam:
 * nothing fetched the rows. Without this, every consumer writes its own SELECT
 * against `operational_expectations`, and the first one to get tenancy or
 * lineage subtly wrong does it silently.
 *
 * So this is the ONE place that turns a question — org, subjects, window — into
 * effective expectations. It queries, enforces tenancy at the query, hands rows
 * to the existing resolver, and returns a typed answer. It reproduces none of
 * the resolver's logic: lineage grouping, revision/correction semantics and
 * fail-closed behaviour all stay where they were ratified.
 *
 * ── DOMAIN-NEUTRAL BY CONSTRUCTION ──
 *
 * It knows orgs, subjects, windows and lineage. It knows nothing about children,
 * rooms, closures or attendance. Callers ask for subject kinds and refs; what
 * those mean belongs to the domain that owns them.
 *
 * ── WHY UNRESOLVED LINEAGES ARE RETURNED, NOT DROPPED ──
 *
 * The resolver fails closed on unratified transitions. A seam that silently
 * omitted those lineages would answer "nothing applies" for a subject whose
 * expectation could not be determined — the most dangerous possible answer,
 * because absence of expectation reads as normal operation. They come back
 * explicitly so the caller must decide.
 */

import { resolveEffectiveExpectations } from "@/lib/operationalExpectations/resolver/resolveEffectiveExpectation";
import type {
    AsOfCoordinate,
    ExpectationLedgerRow,
} from "@/lib/operationalExpectations/resolver/effectiveExpectationTypes";
import { primaryExpectationSubjectId } from "@/lib/operationalExpectations/query/expectationSubjectRef";

/**
 * A queried row: the resolver's columns plus the two facets it deliberately does
 * not read. The resolver resolves WHICH row is effective; the caller still needs
 * WHAT that row says, and `subject_ref` / `condition` carry it.
 */
export interface ExpectationQueryRow extends ExpectationLedgerRow {
    /**
     * The stored Subject facet. Deliberately `unknown`: the intake writes the
     * tuple's subject ARRAY here, and typing it as an object invited exactly the
     * `subject_ref.id` misreading that made this seam match nothing. Read it only
     * through `expectationSubjectRef`.
     */
    subject_ref: unknown;
    condition: Record<string, unknown> | null;
}

export type ExpectationSubjectRef = {
    kind: string;
    /** Durable business id of the subject (never a fact-row id). */
    id: string;
};

export type EffectiveExpectationsQuery = {
    orgId: string;
    subjects: readonly ExpectationSubjectRef[];
    /** The valid-time coordinate — for a service day, that day. */
    asOf: AsOfCoordinate;
};

/** One effective expectation, flattened to what a consumer needs to interpret it. */
export type EffectiveExpectationForSubject = {
    subjectKind: string;
    subjectId: string;
    expectationId: string;
    lineageRootId: string;
    modality: string;
    condition: Record<string, unknown>;
    effectiveFrom: string;
    effectiveTo: string | null;
    standing: string;
};

/** A lineage whose effective state could not be determined. Never silently dropped. */
export type UnresolvedExpectationLineage = {
    subjectKind: string;
    subjectId: string;
    lineageRootId: string;
    reason: string;
};

export type EffectiveExpectationsResult = {
    effective: EffectiveExpectationForSubject[];
    unresolved: UnresolvedExpectationLineage[];
};

/** The storage port. Implemented against Supabase; substituted in tests. */
export type ExpectationQueryGateway = {
    /**
     * Rows for these subjects whose valid-time window can overlap the coordinate,
     * in the caller's org. Over-fetching is safe — the resolver decides
     * effectivity — but crossing the org boundary is not, so the org filter
     * belongs here and never in a caller.
     */
    loadRowsForSubjects(query: EffectiveExpectationsQuery): Promise<ExpectationQueryRow[]>;
};

export async function effectiveExpectationsForWindow(
    query: EffectiveExpectationsQuery,
    gateway: ExpectationQueryGateway,
): Promise<EffectiveExpectationsResult> {
    if (!query.orgId || query.subjects.length === 0) {
        return { effective: [], unresolved: [] };
    }

    const rows = await gateway.loadRowsForSubjects(query);
    if (rows.length === 0) return { effective: [], unresolved: [] };

    const byId = new Map(rows.map((r) => [r.id, r]));

    // The ratified set-level resolver does the lineage grouping and isolation —
    // reproducing either here would be a second implementation of the semantics
    // the program owner ratified.
    const resolutions = resolveEffectiveExpectations(rows, {
        orgId: query.orgId,
        asOf: query.asOf,
    });

    const effective: EffectiveExpectationForSubject[] = [];
    const unresolved: UnresolvedExpectationLineage[] = [];

    for (const [lineageRootId, resolution] of resolutions) {
        if (resolution.kind === "none") continue;

        if (resolution.kind === "unsupported_transition") {
            const offending = byId.get(resolution.expectationId);
            unresolved.push({
                subjectKind: offending?.subject_kind ?? "",
                subjectId: offending ? primaryExpectationSubjectId(offending.subject_ref) : "",
                lineageRootId,
                reason: `unsupported_transition:${resolution.transitionType}`,
            });
            continue;
        }

        const e = resolution.effective;
        const row = byId.get(e.effectiveExpectationId);
        effective.push({
            subjectKind: e.subjectKind,
            subjectId: row ? primaryExpectationSubjectId(row.subject_ref) : "",
            expectationId: e.effectiveExpectationId,
            lineageRootId: e.lineageRootId,
            modality: e.modality,
            condition: row?.condition ?? {},
            effectiveFrom: e.effectiveFrom,
            effectiveTo: e.effectiveTo,
            standing: e.effectiveStanding,
        });
    }

    return { effective, unresolved };
}
