/**
 * Commercial Execution — Funding attribution (the Funding stage's output shape).
 *
 * Funding DECORATES a Commercial Resolution: it allocates the already-evaluated
 * `net` across payers and records a residual. It NEVER changes evaluated value
 * and NEVER creates a charge. Layer order: Execution (priced) → Funding
 * (attributed) → Billing (obligated).
 *
 * Phase 2 defines the full architecture (private pay · subsidy · sponsorship ·
 * scholarship · corporate · split · residual). Phase 6 ships the single-payer
 * default (residual = full net → primary) and the multi-payer engine.
 *
 * Leaf module: imports nothing from the platform.
 * Doctrine: docs/platform/core/commercial-execution-platform.md §7 (Funding stage).
 */

/** The categories of payer responsibility Funding will eventually support. */
export const FUNDING_SOURCE_TYPES = [
    "private_pay",
    "government_subsidy",
    "employer_sponsorship",
    "scholarship",
    "corporate_program",
] as const;
export type FundingSourceType = (typeof FUNDING_SOURCE_TYPES)[number];

/** How an allocation amount was derived. */
export const ALLOCATION_BASES = [
    "fixed_amount", // an absolute cents figure
    "percentage", // a share of the line net
    "residual", // whatever is left after other payers
    "coverage_rule", // computed by a funding coverage rule
] as const;
export type AllocationBasis = (typeof ALLOCATION_BASES)[number];

/** A neutral reference to a responsible party. Consumer-agnostic (not a billing customer). */
export type PayerRef = {
    /** Party kind: household | guardian | agency | employer | sponsor | org | prospect. */
    partyType: string;
    /** Opaque id of the party (may be null for a not-yet-identified default payer). */
    partyId: string | null;
    source: FundingSourceType;
    /** Optional human label. */
    label?: string;
};

/** A coverage rule that participated in an attribution (provenance for explanation). */
export type CoverageRef = {
    /** The funding config entity id (a future funding_* table row). */
    id: string;
    /** Eligibility/coverage rule key. */
    ruleKey: string;
};

/** One payer's slice of a line's net. */
export type FundingAllocation = {
    payer: PayerRef;
    amountCents: number;
    basis: AllocationBasis;
    /** Coverage rules that produced this allocation. */
    coverage?: CoverageRef[];
};

/**
 * The attribution decorating a single resolved line. `allocations` sum + `residual`
 * always equals the line's `net` (invariant enforced by the Funding stage).
 * `null` on a line means Funding did not run → the consumer treats the full net as
 * residual to the primary payer.
 */
export type FundingAttribution = {
    allocations: FundingAllocation[];
    /** Whoever owes the remainder after allocations (default: full net → primary payer). */
    residual: { payer: PayerRef; amountCents: number };
};

/**
 * The plan handed to the Funding stage. Phase 2 shape only; the resolver arrives
 * in Phase 6. A `null`/empty plan yields the single-payer default.
 */
export type FundingPlan = {
    /** The primary responsible party (residual owner when nothing else covers). */
    primary: PayerRef;
    /** Additional funding participants (subsidy, employer, scholarship, …). */
    participants?: PayerRef[];
    /** Eligibility/coverage rule ids to consider, in precedence order. */
    coverageRuleIds?: string[];
};
