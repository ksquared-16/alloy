/**
 * Commercial Execution — Commercial Export (the read-only projection of frozen V1).
 *
 * This is the ONE-WAY face of Commercial Configuration V1 that evaluation consumes.
 * Commercial imports nothing back. The Export types are the platform's OWN
 * vocabulary — the Phase-3 readers map V1 rows (commercial_products,
 * commercial_tuition_rates, program_offering_variants, billing_cadences,
 * commercial_revenue_categories, and the Commercial policy definitions) INTO these
 * shapes. Keeping the contract self-defined is what decouples the platform from
 * V1's storage layout.
 *
 * Phase 2 (core types) — declarations only; readers are Phase 3.
 * Doctrine: docs/platform/core/commercial-execution-platform.md §2, §7.
 */

import type { CommercialType } from "@/lib/commercial/commercialProducts";
import type { ConfigSnapshotRef, PayerType } from "@/lib/commercial/execution/executionTypes";

/** An effective-dated window on any config entity (null start = day one; null end = open). */
export type EffectiveWindow = { start: string | null; end: string | null };

/** Program / offering / variant availability scope. */
export type AvailabilityScope = { programKey: string; locationId: string | null };

/** location_program_categories (program_key) — a Program. */
export type ProgramDef = {
    programKey: string;
    label: string;
    isActive: boolean;
};

/** program_offerings — an attendance type (Full Day, Part Day, Drop-In…). */
export type OfferingDef = {
    id: string;
    programKey: string;
    label: string;
    /** e.g. "full_day" | "part_day" | "drop_in" | "hourly". */
    attendanceType: string;
    /** program_offerings is effective-dated in V1 — carried so evaluation respects the window.
     *  (Phase-3 additive change to the Phase-2 contract; see the export layer review.) */
    effective: EffectiveWindow;
    isActive: boolean;
};

/** program_offering_variants — a quantity (2 days/wk, 5 days/wk, or transparent default). */
export type VariantDef = {
    id: string;
    offeringId: string;
    label: string;
    /** null/null = the transparent default variant (no-quantity offerings). */
    quantityType: string | null;
    quantityValue: number | null;
    isActive: boolean;
};

/** commercial_tuition_rates — matrix-priced tuition (variant × cadence × payer × location). */
export type TuitionRateDef = {
    id: string;
    variantId: string;
    cadenceKey: string;
    payerType: PayerType;
    locationId: string | null;
    rateCents: number;
    /** Explicitly not offered at this scope/cadence — distinct from "no rate set". */
    notOffered: boolean;
    effective: EffectiveWindow;
    revenueCategoryId: string | null;
};

/** commercial_products — the fee/addon/deposit primitive with typed behavior. */
export type CommercialProductDef = {
    id: string;
    commercialType: CommercialType;
    name: string;
    scope: AvailabilityScope;
    amountCents: number;
    /** null = one-time. */
    cadenceKey: string | null;
    revenueCategoryId: string | null;
    /** Typed per commercial_type (fee.required, addon.package, deposit.refundable…). */
    behavior: Record<string, unknown>;
    effective: EffectiveWindow;
    isActive: boolean;
};

/** billing_cadences — the frequency option set. */
export type BillingCadenceDef = {
    cadenceKey: string;
    label: string;
    isActive: boolean;
};

/** commercial_revenue_categories → gl_accounts (Accounting reference). */
export type RevenueCategoryDef = {
    id: string;
    label: string;
    /** Mapped GL account id, or null when unmapped ("Needs accounting mapping"). */
    glAccountId: string | null;
    isActive: boolean;
};

/**
 * A Commercial policy DEFINITION (owned by Commercial; evaluated inside Execution).
 * The Phase-5 policy stage lifts the existing financial_policies engine and
 * re-sources it to these Commercial scope keys.
 */
export type CommercialPolicyDef = {
    id: string;
    /** e.g. "sibling_discount" | "waiver" | "proration" | "grace_period" | "late_fee". */
    kind: string;
    /** Definition scope (org → location → program → variant); most-specific wins. */
    scope: { locationId?: string | null; programKey?: string | null; variantId?: string | null };
    effective: EffectiveWindow;
    /** Opaque, kind-specific parameters (percentage, method, threshold…). Validated in Phase 5. */
    params: Record<string, unknown>;
    isActive: boolean;
};

/**
 * The full read projection handed to evaluation, plus the version stamp every
 * resolution pins for reproducibility.
 */
export type CommercialExport = {
    orgId: string;
    version: ConfigSnapshotRef;
    programs: ProgramDef[];
    offerings: OfferingDef[];
    variants: VariantDef[];
    tuitionRates: TuitionRateDef[];
    products: CommercialProductDef[];
    cadences: BillingCadenceDef[];
    revenueCategories: RevenueCategoryDef[];
    policies: CommercialPolicyDef[];
};
