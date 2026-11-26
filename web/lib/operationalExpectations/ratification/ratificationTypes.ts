/**
 * Operational Expectations — Ratification types (P1 · Wave C · C2).
 *
 * The typed contract of the ONE ratification path that promotes a `proposed`
 * deontic expectation to effective `binding` standing via an immutable, lineage-
 * linked Ratification Act. Org + actor + the `operational_expectations.ratify`
 * capability come only from the server-trusted context — never from input.
 *
 * SCOPE: ratification only. It never authors a tuple (that is Wave B), never
 * evaluates, judges, or derives gaps, and does not implement revision/correction
 * propagation (Wave D).
 */

/** Server-trusted ratification context (resolved from the admin access context). */
export interface RatificationContext {
    orgId: string;
    actorUserId: string | null;
    actorLabel?: string | null;
    /** The authority the ratifier acts under (server-resolved / audit). */
    ratifierAuthorityKey: string;
    /** Whether an authenticated actor holding the ratify capability is present. */
    actorAuthenticated: boolean;
}

/** The typed ratification input. No standing, no org, no recorded time as input. */
export interface RatifyInput {
    /** Retry-safety key. */
    idempotencyKey: string;
    /** The expectation being ratified. */
    expectationId: string;
    /** Optional operator rationale (audit). */
    rationale?: string | null;
}

export type RatificationRejectionCode =
    | "unauthorized"
    | "insufficient_authority"
    | "invalid_idempotency_key"
    | "invalid_expectation_ref"
    | "expectation_not_found"
    | "cross_org_expectation"
    | "not_ratifiable_modality"
    | "not_proposed";

export interface RatificationAct {
    ratificationId: string;
    expectationId: string;
    newStanding: "binding";
    ratifiedAt: string;
}

/** Discriminated ratification result. Never throws to the caller. */
export type RatificationResult =
    | { status: "disabled" }
    | {
          status: "ratified";
          act: RatificationAct;
          /** The one canonical Ratification Act event id. */
          ratificationActEventId: string;
          /** True when returned from an existing ratification (idempotent). */
          idempotent: boolean;
      }
    | { status: "rejected"; code: RatificationRejectionCode; message: string }
    | { status: "conflict"; code: "ratification_conflict"; message: string }
    | { status: "failed"; message: string };

export interface RatificationOk {
    ok: true;
}
export interface RatificationRejection {
    ok: false;
    code: RatificationRejectionCode;
    message: string;
}
export type RatificationValidation = RatificationOk | RatificationRejection;
