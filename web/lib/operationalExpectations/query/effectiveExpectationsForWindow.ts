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

/**
 * One effective expectation, flattened to what a consumer needs to interpret it.
 *
 * ── TWO STANDINGS, BOTH TRUE ──
 *
 * `standing` is what was AUTHORED. `effectiveStanding` is what is GOVERNED now.
 * They differ exactly when a proposal has been ratified, and both are returned
 * because both are real: the authored fact never changes (this ledger is
 * append-only and ratification deliberately does not mutate the row), while the
 * governed answer is what an operator is entitled to rely on today.
 *
 * A consumer asking "may I rely on this?" must read `effectiveStanding`. A
 * consumer asking "what did the author claim?" reads `standing`. Collapsing them
 * into one field is what made a ratified expectation indistinguishable from an
 * unratified one for every reader in the system.
 */
export type EffectiveExpectationForSubject = {
    subjectKind: string;
    subjectId: string;
    expectationId: string;
    lineageRootId: string;
    modality: string;
    condition: Record<string, unknown>;
    effectiveFrom: string;
    effectiveTo: string | null;
    /** As AUTHORED. Never promoted, never mutated. */
    standing: string;
    /** As GOVERNED now: authored standing, promoted by valid ratification evidence. */
    effectiveStanding: string;
    /** When it was ratified, when it was. The evidence behind `effectiveStanding`. */
    ratifiedAt: string | null;
    /** The authority the ratification was made under. */
    ratifiedUnderAuthorityKey: string | null;
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

/** One expectation's ratification evidence, as stored. */
export type ExpectationRatificationEvidence = {
    expectationId: string;
    ratifiedAt: string;
    ratifierAuthorityKey: string;
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
    /**
     * Ratification evidence for these expectations, in the caller's org.
     *
     * REQUIRED, not optional. An optional loader would mean a gateway that
     * forgot to implement it silently reported every ratified expectation as
     * unratified — the failure this method exists to end, arriving quietly
     * through a different door.
     */
    loadRatifications(
        orgId: string,
        expectationIds: readonly string[],
    ): Promise<readonly ExpectationRatificationEvidence[]>;
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

    /*
     * RATIFICATION EVIDENCE, FOR THE ROWS THAT ACTUALLY WON.
     *
     * Loaded for every candidate row rather than only the effective ones,
     * because a lineage's effective row is decided below and asking twice would
     * mean two round trips to answer one question. A ratification belongs to the
     * expectation it names, so a superseding revision does NOT inherit its
     * predecessor's ratification — a revised plan is a new proposal, and it
     * stands proposed until somebody ratifies THAT.
     */
    const ratifications = new Map<string, ExpectationRatificationEvidence>();
    for (const r of await gateway.loadRatifications(query.orgId, [...byId.keys()])) {
        ratifications.set(r.expectationId, r);
    }

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
        const ratified = ratifications.get(e.effectiveExpectationId) ?? null;
        /*
         * A ratification promotes a PROPOSAL. It cannot demote, and it has
         * nothing to say about `model` — a `predicted` expectation imposes no
         * obligation and is not ratifiable, so a stray ratification row against
         * one must not silently make it binding.
         */
        const authoredStanding = e.effectiveStanding;
        const governed = ratified && authoredStanding === "proposed" ? "binding" : authoredStanding;
        effective.push({
            subjectKind: e.subjectKind,
            subjectId: row ? primaryExpectationSubjectId(row.subject_ref) : "",
            expectationId: e.effectiveExpectationId,
            lineageRootId: e.lineageRootId,
            modality: e.modality,
            condition: row?.condition ?? {},
            effectiveFrom: e.effectiveFrom,
            effectiveTo: e.effectiveTo,
            standing: authoredStanding,
            effectiveStanding: governed,
            ratifiedAt: ratified?.ratifiedAt ?? null,
            ratifiedUnderAuthorityKey: ratified?.ratifierAuthorityKey ?? null,
        });
    }

    return { effective, unresolved };
}
