/**
 * Lifecycle observations — the append-only record of what happened TO a
 * Decision Package after it was created.
 *
 * A Decision Package is immutable at creation (Decision 020). Everything that
 * happens afterwards — it was presented, an operator accepted it, its window
 * closed, a newer package replaced it, an execution authority acted — is an
 * observation that REFERENCES the package. Nothing here writes to a package,
 * and nothing here is a status field.
 *
 * This module owns the observation vocabulary, the per-kind evidence contracts,
 * validation, and the canonical ordering. It performs no I/O.
 *
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 020
 * @see supabase/migrations/20260804210000_trust_lifecycle_observation_kinds.sql
 */

import { TRUST_OBSERVATION_KINDS, type TrustObservationKind } from "@/lib/trust/persistence/trustDecisionRepository";

export { TRUST_OBSERVATION_KINDS };
export type { TrustObservationKind };

/**
 * Which lifecycle dimension each kind speaks to.
 *
 * Exhaustive over the vocabulary by construction: a new kind added to
 * `TRUST_OBSERVATION_KINDS` without an entry here fails to compile.
 */
export const OBSERVATION_DIMENSION: Readonly<Record<TrustObservationKind, LifecycleDimension>> = {
    presented: "review",
    accepted: "review",
    rejected: "review",
    overridden: "review",
    modified: "review",
    deferred: "review",
    executed: "execution",
    outcome: "execution",
    expired: "standing",
    superseded: "standing",
};

export type LifecycleDimension = "review" | "execution" | "standing";

/** Why a recommendation's window closed. Recorded so the cause is auditable. */
export const EXPIRY_KINDS = [
    /** A declared expiry time passed. The only kind with a precedent today (`task_assist_proposals.expires_at`). */
    "scheduled",
    /** Organization or platform policy withdrew the recommendation. */
    "policy",
    /** The truth the recommendation was computed against moved. */
    "stale_context",
    /** An administrator withdrew it by hand. */
    "administrative",
] as const;
export type ExpiryKind = (typeof EXPIRY_KINDS)[number];

/** Result carried by an `outcome` observation. */
export const EXECUTION_RESULTS = ["succeeded", "failed"] as const;
export type ExecutionResult = (typeof EXECUTION_RESULTS)[number];

/**
 * One observation, as read back from `trust_decision_observations`.
 *
 * `id` and `observed_at` together give a stable total order, which is what
 * makes the projection independent of database row order.
 */
export type LifecycleObservationRecord = {
    readonly id: string;
    readonly org_id: string;
    readonly package_id: string;
    readonly observation_kind: string;
    readonly observed_by_actor_type: "operator" | "system" | "automation";
    readonly observed_by_actor_id: string | null;
    readonly channel: string;
    /** Evidence that an execution authority acted. Never an instruction to act. */
    readonly execution_reference: string | null;
    readonly detail: Readonly<Record<string, unknown>>;
    readonly observed_at_iso: string;
};

/** The minimum a Decision Package must expose for its lifecycle to be projected. */
export type LifecycleSubjectPackage = {
    readonly id: string;
    readonly org_id: string;
    /** A refusal was never actionable, so it has no reviewable lifecycle. */
    readonly outcome: string;
    readonly created_at_iso: string;
    /** Lineage this package declares. Present for symmetry; a package's own predecessor. */
    readonly supersedes_package_id: string | null;
};

/**
 * A package that claims to supersede the subject.
 *
 * Supplied by the caller because the projection performs no I/O. When absent,
 * supersession is projected from the observation alone and the cross-org and
 * cycle checks that need the successor are reported as unverifiable rather than
 * silently passed.
 */
export type SupersedingPackageRef = {
    readonly id: string;
    readonly org_id: string;
    /** What this package supersedes. Used to detect a lineage cycle. */
    readonly supersedes_package_id: string | null;
};

export function isKnownObservationKind(kind: string): kind is TrustObservationKind {
    return (TRUST_OBSERVATION_KINDS as readonly string[]).includes(kind);
}

export function parseExpiryKind(raw: unknown): ExpiryKind | null {
    return typeof raw === "string" && (EXPIRY_KINDS as readonly string[]).includes(raw) ? (raw as ExpiryKind) : null;
}

export function parseExecutionResult(raw: unknown): ExecutionResult | null {
    return typeof raw === "string" && (EXECUTION_RESULTS as readonly string[]).includes(raw)
        ? (raw as ExecutionResult)
        : null;
}

export function readStringDetail(detail: Readonly<Record<string, unknown>>, key: string): string | null {
    const value = detail[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Canonical total order: `observed_at` ascending, then `id` ascending.
 *
 * The `id` tie-break is what makes equal timestamps deterministic. It is a
 * documented ordering field rather than an accident of read order, and it is
 * stable across shuffles, re-reads and replicas.
 *
 * Returns a new array; the input is never mutated.
 */
export function orderObservationsCanonically(
    observations: readonly LifecycleObservationRecord[],
): readonly LifecycleObservationRecord[] {
    return [...observations].sort((a, b) => {
        if (a.observed_at_iso !== b.observed_at_iso) return a.observed_at_iso < b.observed_at_iso ? -1 : 1;
        if (a.id !== b.id) return a.id < b.id ? -1 : 1;
        return 0;
    });
}
