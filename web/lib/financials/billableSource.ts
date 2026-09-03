/**
 * Financial substrate vocabularies (P3.1 — L5 Operational Consequences).
 *
 * These are the code-owned mirrors of the additive substrate added by
 * `supabase/migrations/20260630120000_financial_substrate_generalization_p3_1.sql`.
 * They generalize the single posting substrate (charges / ledger_transactions /
 * gl_journal_lines) so childcare Financial Resolution can post WITHOUT
 * job-vertical coupling.
 *
 * Doctrine: docs/platform/modules/billing-financials-platform.md
 *           ("Ratified P3.1 implementation gates").
 *
 * Note: legacy `charge_type` ({service, fee, adjustment, cancellation_fee}) is
 * FROZEN for job compatibility. New taxonomy lives on `charge_category`.
 */

/** Polymorphic billable-source kinds. Neither is privileged. */
/*
 * THE BILLABLE SOURCE VOCABULARY.
 *
 * `customer` closes HOUSEHOLD_BILLABLE_SOURCE. A family incurs charges BEFORE anyone is enrolled — a
 * waitlist fee, a registration or application fee, a deposit — and those have no agreement to hang
 * off. The household is an existing canonical durable subject, so no Financials-only "account"
 * entity is invented and no childcare-specific `child_id` column is added: the polymorphic pair
 * already carries the distinction.
 *
 * None of the three is privileged. Which source a PARTICULAR charge requires is a property of its
 * charge template, never of the Financials surface.
 */
export const BILLABLE_SOURCE_TYPES = ["job", "enrollment_agreement", "customer"] as const;
export type BillableSourceType = (typeof BILLABLE_SOURCE_TYPES)[number];

export function isBillableSourceType(value: unknown): value is BillableSourceType {
    return typeof value === "string" && (BILLABLE_SOURCE_TYPES as readonly string[]).includes(value);
}

/**
 * THE CHILDCARE BILLABLE SOURCES — the set the childcare money guarantees apply to.
 *
 * Posted-charge immutability, the correction-by-lineage rule and the RESTRICTIVE role gate were all
 * written against the literal `'enrollment_agreement'`. When `customer` was admitted so a family
 * could be charged before enrolling, it became representable without becoming protected. This is the
 * set those rules quantify over, in one place, so admitting a fourth source cannot silently skip
 * them again. `job` is deliberately outside it: job billing owns its own lifecycle.
 */
export const CHILDCARE_BILLABLE_SOURCE_TYPES = ["enrollment_agreement", "customer"] as const;
export type ChildcareBillableSourceType = (typeof CHILDCARE_BILLABLE_SOURCE_TYPES)[number];

export function isChildcareBillableSource(value: unknown): value is ChildcareBillableSourceType {
    return (
        typeof value === "string"
        && (CHILDCARE_BILLABLE_SOURCE_TYPES as readonly string[]).includes(value)
    );
}

/**
 * Additive charge taxonomy (P3.1). Keep aligned with the CHECK in the migration.
 * `charge_type` stays frozen; this is the forward-looking dimension.
 */
export const CHARGE_CATEGORIES = [
    "tuition",
    "deposit",
    "consumable_fee",
    "late_pickup",
    "one_time",
    "discount",
    "credit",
    "adjustment",
    "fee",
    "subsidy_offset",
] as const;
export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number];

export function isChargeCategory(value: unknown): value is ChargeCategory {
    return typeof value === "string" && (CHARGE_CATEGORIES as readonly string[]).includes(value);
}

/** Existing charge lifecycle states (unchanged by P3.1). */
export const CHARGE_STATUSES = ["draft", "posted", "partially_paid", "paid", "void"] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

/** A childcare charge is "posted" (immutable) once it leaves draft. */
export function isPostedStatus(status: string): boolean {
    return status !== "draft";
}

/** Default (and currently only) currency. Explicit so multi-currency is additive later. */
export const DEFAULT_CURRENCY_CODE = "USD";
