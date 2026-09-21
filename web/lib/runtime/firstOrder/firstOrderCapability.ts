import type { AttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import type { OpportunityWorkspaceLifecycleRail } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail";
import type { PrepaidReaderResult } from "@/lib/financials/prepaid/readAccountPrepaidPosition";
import type { AccountLedgerPosition } from "@/lib/runtime/firstOrder/readAccountLedgerPosition";
import type { HealthFirstOrderSupplements } from "@/lib/runtime/firstOrder/readHealthFirstOrderSupplements";
import type { FirstOrderField } from "@/lib/runtime/firstOrder/firstOrderWorkUnitProjection";

/**
 * THE FIRST-ORDER CAPABILITY CONTRACT — what a configured field needs in order to be COMPILED
 * rather than hand-written.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A SECOND REGISTRY ──
 *
 * Alloy already owns the declarative half of this. `CanonicalDataProvider`
 * (`lib/fields/canonicalDataProviderModel.ts`) declares a semantic `refKey`, its kind, grain,
 * output shape, consumer availability — including a `focus_panel` consumer surface — and a
 * `resolverOwner`. What it does NOT carry is anything an execution planner can run:
 * `resolverOwner` is a diagnostic STRING, and no provider declares the READ it requires.
 *
 * That is not an oversight in the provider model; it is a consequence of how every existing
 * configured surface resolves. The queue row compiles configuration into values by reading a
 * FROZEN context the caller already assembled (`resolveQueueRowChildrenFieldFromContext`), so no
 * provider ever needs to say what it would have had to fetch. A′'s entire value is the opposite:
 * planning CONCURRENT READS before anything is frozen. So the missing primitive is precise —
 * a provider cannot declare its prerequisite — and this module supplies exactly that one thing,
 * as an EXECUTION slice attached to the existing semantic identity, not as a rival catalogue of
 * what fields exist.
 *
 * ── THE DOCTRINE THIS ENCODES ──
 *
 *   NEW SEMANTIC CAPABILITY  → CODE   (register one capability here, with its prerequisite)
 *   NEW COMPOSITION OF THEM  → CONFIG (name its semantic key in a card's configured fields)
 *
 * Nothing about card membership, field membership, order or geometry may appear in a capability.
 * A capability answers ONE question: given the prerequisites it declared, what is this semantic
 * fact, and in what state?
 */

/**
 * A PREREQUISITE is a canonical read. It is named, not described: the plan deduplicates by this
 * key, so two capabilities naming the same prerequisite cost one execution.
 */
/*
 * NAMES THAT CANNOT BE CONFUSED WITH A CARD.
 *
 * These were `crm`, `children`, `attendance`, `prepaid` — three of which are also CARD keys. The
 * collision was not cosmetic: the gate that proves the composer names no card key could not tell
 * `"children"` the read from `"children"` the card, so the property was unprovable and the gate
 * reported a violation that was not one. A read and a surface are different kinds of thing and
 * now have different names.
 */
export type FirstOrderPrerequisiteKey =
    | "population"
    | "crm_projection"
    | "children_projection"
    | "personal_seen"
    | "attendance_fold"
    | "health_profile"
    | "health_supplements"
    | "process_config"
    | "prepaid_position"
    /*
     * KPI values and Work View values are FIRST-ORDER product truth, not Stage-2 detail. They
     * enter the plan as prerequisites like any other read, so they are deduped, run concurrently
     * with the card reads, and cost nothing when a surface configures none of them.
     */
    | "header_kpis"
    | "work_view_totals"
    /*
     * The account's current-period ledger: charges, their applications, and the reconciliation
     * both feed. Separate from `prepaid_position` because they answer different questions —
     * prepaid is money sitting ON the account, this is what the account OWES — and a surface may
     * legitimately select one without the other.
     */
    | "account_ledger";

/**
 * Authorization is a REQUIREMENT declared here and EVALUATED at request time. A capability never
 * carries a verdict, and a compiled plan never stores one — see `compileFirstOrderPlan`.
 */
export type FirstOrderAuthorityRequirement = "none" | "financials_read" | "health_view" | "analytics_read";

/** Everything a projector may read. Assembled once by the composer; never fetched by a projector. */
export type FirstOrderProjectionContext = {
    /** The focused subject's record, enriched with CRM and children projections. Null when unresolved. */
    readonly subjectTruth: Record<string, unknown> | null;
    readonly subjectRow: Record<string, unknown> | null;
    readonly customerMemberId: string | null;
    readonly householdId: string | null;
    /** Prerequisite results. `undefined` = not planned; `null` = planned and FAILED. */
    readonly attendance?: AttendanceCardVM | null;
    readonly healthProfile?: Map<string, Record<string, unknown>> | null;
    readonly healthSupplements?: HealthFirstOrderSupplements | null;
    readonly prepaid?: PrepaidReaderResult | null;
    readonly accountLedger?: AccountLedgerPosition | null;
    readonly rail?: OpportunityWorkspaceLifecycleRail | null;
    readonly processConfigRead?: boolean;
    /** Resolved KPI values by configured source key, or null when the read failed. */
    readonly headerKpis?: { status: string; values: Record<string, unknown> } | null;
    /** Resolved Work View totals by configured view id, or null when the read failed. */
    readonly workViewTotals?: { status: string; totalsByViewId: Record<string, number | null> } | null;
    readonly childrenRead?: boolean;
};

export type FirstOrderScalar = string | number;

export type FirstOrderCapability = {
    /** Stable semantic identity. This is what configuration names. */
    readonly semanticKey: string;
    /** The module that DECIDES this value. Diagnostics and audit — never dispatch. */
    readonly canonicalOwner: string;
    /** Subject grain the fact is about. */
    readonly grain: "work_unit" | "record" | "child" | "household";
    /** Reads this capability cannot be answered without. Deduplicated across the whole plan. */
    readonly prerequisites: readonly FirstOrderPrerequisiteKey[];
    readonly authorization: FirstOrderAuthorityRequirement;
    /**
     * Produce the field, INCLUDING its state. The state belongs to the capability result — a card
     * must never reconstruct UNKNOWN or ZERO for itself, which is how two surfaces come to disagree
     * about whether a read failed or a value is genuinely absent.
     */
    readonly project: (ctx: FirstOrderProjectionContext) => FirstOrderField<FirstOrderScalar>;
    /**
     * FAMILY capabilities only: project ONE configured member (a KPI source key, a Work View id).
     *
     * A card field's semantic key is registered once by the platform; a KPI slot names a
     * tenant-configured identity, so the family owns the read and the member selects within its
     * result. When present this is used in place of `project`.
     */
    readonly projectMember?: (
        identity: string,
        ctx: FirstOrderProjectionContext,
    ) => FirstOrderField<FirstOrderScalar>;
};

/**
 * DYNAMIC CAPABILITY FAMILIES — declared HERE, in the contract module.
 *
 * They were first declared in the compiler, which the registry then imported while the compiler
 * imported the registry's lookup. That cycle left the constants `undefined` at registry
 * initialisation, so every family registered as `"undefined:*"` and every configured KPI and Work
 * View compiled as an unsupported capability. The contract module is imported by both and imports
 * neither, so there is no cycle to get wrong.
 */
export const KPI_CAPABILITY_FAMILY = "kpi" as const;
export const WORK_VIEW_CAPABILITY_FAMILY = "work_view" as const;

/** Why a configured semantic key could not be compiled. Never a silent omission. */
export type FirstOrderUnsupportedCapability = {
    readonly semanticKey: string;
    readonly cardKey: string;
    readonly reason: "no_registered_capability";
    readonly message: string;
};
