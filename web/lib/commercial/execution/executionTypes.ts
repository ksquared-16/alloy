/**
 * Commercial Execution — the canonical execution contract (core types).
 *
 * `CommercialResolution` is the consumer-neutral output every downstream
 * subsystem consumes (Billing, Simulator, Quote, Forecasting, Contracts, AI…).
 * It is a VALUATION, not financial truth: it contains NO charge / obligation /
 * invoice / ledger vocabulary. Billing is the first consumer, never the owner.
 *
 * Input:  CommercialContext   →   Output:  CommercialResolution   (pure, deterministic)
 *
 * The shape was pressure-tested against two non-billing consumers (Quote Builder,
 * Revenue Forecasting) before locking; the resulting refinements are baked in:
 * per-line status + reason codes, config-version pinning, platform-owned rounding,
 * an accounting `recognition` hint, a typed explanation graph, and relational
 * evaluation (see evaluateSet in ./index).
 *
 * Phase 2 (core types) — declarations only; evaluation is Phase 4.
 * Doctrine: docs/platform/core/commercial-execution-platform.md §5.
 */

import type { FundingAttribution } from "@/lib/commercial/execution/funding";
import type { LineExplanation, ResolutionExplanationGraph } from "@/lib/commercial/execution/explanation";

// ─── Money & precision (platform-owned rounding) ─────────────────────────────

/** An amount in minor units (cents). Currency lives alongside; never per-fractional. */
export type Money = { amountCents: number; currency: string };

/** How the platform rounds. Consumers must NEVER re-round — one engine, one answer. */
export const ROUNDING_RULES = ["half_up", "half_even", "bankers", "floor", "ceil"] as const;
export type RoundingRule = (typeof ROUNDING_RULES)[number];

export type Precision = { currency: string; roundingRule: RoundingRule };

// ─── Context (the input) ─────────────────────────────────────────────────────

/** Payer intent at resolution time (not the final funding split — that is the Funding stage). */
export type PayerType = "private_pay" | "subsidy" | "corporate";

/**
 * The subject a resolution is about. Deliberately NEUTRAL — never "agreement".
 * `child` (real), `prospect` (quote), `projected_seat` (forecast), `cohort`/
 * `household` (relational). Members support relational evaluation (siblings).
 */
export type SubjectRef = {
    type: "child" | "prospect" | "prospect_household" | "cohort" | "projected_seat";
    id: string | null;
    /** Member subject ids for a household/cohort (drives sibling/family/volume pricing). */
    members?: string[];
    label?: string;
};

/** Where in the Commercial hierarchy this context points. */
export type CommercialScope = {
    programKey: string;
    offeringId?: string;
    variantId?: string;
    locationId?: string | null;
};

/** The committed shape ("Expected") when known — drives the recurring basis. */
export type Commitment = {
    cadenceKey?: string;
    scheduleBasis?: string;
    payerIntent?: PayerType;
};

/**
 * An optional operational input a CONSUMER supplies (attendance breach, schedule
 * change, absence…). The platform owns the policy logic; the fact that triggers a
 * fact-dependent policy (late fee, vacation credit) comes in as a signal.
 */
export type CommercialSignal = {
    kind: string; // e.g. "late_pickup" | "schedule_change" | "absence"
    occursOn: string; // YYYY-MM-DD
    attributes?: Record<string, string | number | boolean | null>;
};

/** What the consumer is doing — the single field that makes this a platform. */
export type EvaluationMode = "actual" | "hypothetical" | "projected";

/** The neutral input to evaluation. */
export type CommercialContext = {
    subject: SubjectRef;
    scope: CommercialScope;
    commitment?: Commitment;
    signals?: CommercialSignal[];
    /** Resolution date (YYYY-MM-DD). Selects effective-dated config. */
    asOf: string;
    /** Optional service window the resolution covers. */
    period?: { start: string; end?: string };
    mode: EvaluationMode;
};

// ─── Resolution (the output) ─────────────────────────────────────────────────

/** What a resolved line IS (drives explanation & consumer interpretation). */
export const COMMERCIAL_LINE_KINDS = [
    "tuition",
    "fee",
    "addon",
    "deposit",
    "proration",
    "proration_credit",
    "discount",
    "credit",
] as const;
export type CommercialLineKind = (typeof COMMERCIAL_LINE_KINDS)[number];

/** Per-line and per-resolution status. */
export const RESOLUTION_STATUSES = ["resolved", "partial", "not_offered", "unresolved"] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

/** Structured reason a line is not_offered / unresolved (never a free-form string). */
export const RESOLUTION_REASON_CODES = [
    "no_rate_for_scope",
    "not_offered_at_scope",
    "cadence_unavailable",
    "no_effective_config",
    "unsupported_schedule_basis",
    "missing_required_input",
    "policy_excluded",
] as const;
export type ResolutionReasonCode = (typeof RESOLUTION_REASON_CODES)[number];

/** Provenance back to the frozen Commercial V1 entity that produced a line. */
export type CommercialSourceRef = {
    /** V1 entity kind (e.g. "commercial_tuition_rates" | "commercial_products"). */
    entity: string;
    id: string;
    /** Program/offering/variant coordinates that located it, when relevant. */
    scope?: CommercialScope;
};

/** The billing frequency a line recurs on (null = one-time). */
export type CadenceRef = {
    /** billing_cadences item key (e.g. "monthly", "weekly"). */
    cadenceKey: string;
    label?: string;
} | null;

/** How revenue for this line is recognized — derived by the platform from behavior + category. */
export type RecognitionTreatment = "immediate" | "deferred" | "liability";

/** A policy modification applied to a line (discount, waiver, proration adjustment). */
export type PolicyAdjustment = {
    /** Policy kind (e.g. "sibling_discount" | "waiver" | "proration" | "grace_period" | "late_fee"). */
    kind: string;
    /** Signed cents applied to gross (negative reduces). */
    amountCents: number;
    /** The Commercial policy entity that produced this adjustment. */
    source: CommercialSourceRef;
    label?: string;
};

/** Accounting metadata: WHERE this line would post. Metadata only — never a posting. */
export type LineAccounting = {
    revenueCategoryId: string;
    /** Resolved GL account when the revenue category is mapped; null when unmapped. */
    glAccountId: string | null;
    recognition: RecognitionTreatment;
};

/** One priced, policy-adjusted, attributed line of a resolution. */
export type ResolvedCommercialLine = {
    lineKey: string;
    status: ResolutionStatus;
    reason?: ResolutionReasonCode;
    kind: CommercialLineKind;
    source: CommercialSourceRef;
    cadence: CadenceRef;
    /** Pre-policy amount. */
    gross: Money;
    /** Policy modifications (may be empty). */
    adjustments: PolicyAdjustment[];
    /** Post-policy amount (gross + Σ adjustments), platform-rounded. */
    net: Money;
    /** Payer allocation; null ⇒ Funding did not run (consumer treats full net as residual). */
    funding: FundingAttribution | null;
    accounting: LineAccounting;
    /** Typed product behavior copied from the source (refundable, package, required…). */
    behavior: Record<string, unknown>;
    explanation: LineExplanation;
};

/** Which config snapshot a resolution was computed against (reproducibility/audit). */
export type ConfigSnapshotRef = {
    /** Opaque version identifier for the org's Commercial config at `asOf`. */
    version: string;
    /** The effective date the config was read at (YYYY-MM-DD). */
    effectiveOn: string;
};

/**
 * THE canonical execution contract. Consumer-neutral, pure, recomputable,
 * version-pinned. Contains no financial truth.
 */
export type CommercialResolution = {
    /** Deterministic key over (context + config version) — idempotency & cache identity. */
    resolutionKey: string;
    /** Which config this was resolved against (reproducibility). */
    configVersion: ConfigSnapshotRef;
    /** Echoed input. */
    context: CommercialContext;
    /** Rollup status; `partial` when some lines resolved and others did not. */
    status: ResolutionStatus;
    lines: ResolvedCommercialLine[];
    /** Platform-owned precision; consumers must not re-round. */
    precision: Precision;
    effective: { asOf: string; window?: { start: string; end?: string } };
    explanation: ResolutionExplanationGraph;
};
