/**
 * Commercial Execution — Export readers (one pure reader per V1 concern).
 *
 * Each reader projects one slice of frozen Commercial V1 into canonical platform
 * types. Storage naming (table/column) stays here; the returned types speak
 * platform vocabulary. No joins are pushed to consumers — relationship resolution
 * happens in composeCommercialExport.
 *
 * Tables consumed:
 *   location_program_categories   → Programs
 *   program_offerings             → Offerings
 *   program_offering_variants     → Variants
 *   commercial_tuition_rates      → Pricing
 *   commercial_products           → Commercial Products
 *   option_sets / option_set_items (set_key='commercial_billing_cadence') → Cadences
 *   commercial_revenue_categories → Revenue Categories
 *   gl_accounts                   → (validation only: existence of mapped GL account)
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §2.
 */

import type {
    BillingCadenceDef,
    CommercialProductDef,
    OfferingDef,
    ProgramDef,
    RevenueCategoryDef,
    TuitionRateDef,
    VariantDef,
} from "@/lib/commercial/execution/commercialExport";
import type { CommercialType } from "@/lib/commercial/commercialProducts";
import type { PayerType } from "@/lib/commercial/execution/executionTypes";
import { type ExportReadContext, nstr, obj, str } from "@/lib/commercial/execution/export/readerTypes";

const VALID_PAYER_TYPES: PayerType[] = ["private_pay", "subsidy", "corporate"];
const VALID_COMMERCIAL_TYPES: CommercialType[] = ["fee", "addon", "deposit"];

function payerType(v: unknown): PayerType {
    const s = str(v) || "private_pay";
    return (VALID_PAYER_TYPES as string[]).includes(s) ? (s as PayerType) : "private_pay";
}

/**
 * Programs. `location_program_categories` is location-scoped and keyed by `key`
 * (the program_key that offerings reference). The platform's Program identity is
 * the program_key, so rows are deduped by key (first label wins; active if any
 * location row is active).
 */
export async function readPrograms(ctx: ExportReadContext): Promise<ProgramDef[]> {
    const { data, error } = await ctx.supabase
        .from("location_program_categories")
        .select("id, key, label, is_active")
        .eq("org_id", ctx.orgId)
        .order("label", { ascending: true });
    if (error) throw new Error(`readPrograms: ${error.message}`);

    const byKey = new Map<string, ProgramDef>();
    for (const r of data ?? []) {
        const programKey = str((r as Record<string, unknown>).key).trim();
        if (!programKey) continue;
        const label = str((r as Record<string, unknown>).label).trim() || programKey;
        const isActive = (r as Record<string, unknown>).is_active !== false;
        const existing = byKey.get(programKey);
        if (existing) {
            existing.isActive = existing.isActive || isActive; // active if any location offers it
        } else {
            byKey.set(programKey, { programKey, label, isActive });
        }
    }
    return [...byKey.values()];
}

/** Offerings — attendance types under a program. Effective-dated in V1. */
export async function readOfferings(ctx: ExportReadContext): Promise<OfferingDef[]> {
    const { data, error } = await ctx.supabase
        .from("program_offerings")
        .select("id, program_key, label, attendance_type, status, effective_start, effective_end, is_active")
        .eq("org_id", ctx.orgId)
        .order("sort_order", { ascending: true });
    if (error) throw new Error(`readOfferings: ${error.message}`);

    return (data ?? []).map((raw) => {
        const r = raw as Record<string, unknown>;
        const status = str(r.status).trim();
        return {
            id: str(r.id),
            programKey: str(r.program_key),
            label: str(r.label),
            attendanceType: str(r.attendance_type),
            effective: { start: nstr(r.effective_start), end: nstr(r.effective_end) },
            // Active unless explicitly inactive or archived (V1 carries both a boolean and a status).
            isActive: r.is_active !== false && status !== "archived",
        } satisfies OfferingDef;
    });
}

/** Variants — quantity options under an offering (or a transparent default). */
export async function readVariants(ctx: ExportReadContext): Promise<VariantDef[]> {
    const { data, error } = await ctx.supabase
        .from("program_offering_variants")
        .select("id, offering_id, label, quantity_type, quantity_value, status, is_active")
        .eq("org_id", ctx.orgId)
        .order("sort_order", { ascending: true });
    if (error) throw new Error(`readVariants: ${error.message}`);

    return (data ?? []).map((raw) => {
        const r = raw as Record<string, unknown>;
        const status = str(r.status).trim();
        const qv = r.quantity_value;
        return {
            id: str(r.id),
            offeringId: str(r.offering_id),
            label: str(r.label),
            quantityType: nstr(r.quantity_type),
            quantityValue: qv == null ? null : Number(qv),
            isActive: r.is_active !== false && status !== "archived",
        } satisfies VariantDef;
    });
}

/** Pricing — matrix tuition rates (variant × cadence × payer × location). */
export async function readPricing(ctx: ExportReadContext): Promise<TuitionRateDef[]> {
    // NOTE: revenue_category_id exists on the table (migration 20260713000001) but the
    // V1 Tuition UI does not yet populate it (wiring is V2); it is read here and will
    // usually be null. Surfaced in the export layer review.
    const { data, error } = await ctx.supabase
        .from("commercial_tuition_rates")
        .select(
            "id, location_id, variant_id, cadence_key, payer_type, rate_cents, not_offered, is_active, effective_start, effective_end, revenue_category_id",
        )
        .eq("org_id", ctx.orgId);
    if (error) throw new Error(`readPricing: ${error.message}`);

    return (data ?? []).map((raw) => {
        const r = raw as Record<string, unknown>;
        return {
            id: str(r.id),
            variantId: str(r.variant_id),
            cadenceKey: str(r.cadence_key),
            payerType: payerType(r.payer_type),
            locationId: nstr(r.location_id),
            rateCents: Number(r.rate_cents ?? 0),
            notOffered: r.not_offered === true,
            effective: { start: nstr(r.effective_start), end: nstr(r.effective_end) },
            revenueCategoryId: nstr(r.revenue_category_id),
        } satisfies TuitionRateDef;
    });
}

/** Commercial Products — the fee/addon/deposit primitive with typed behavior. */
export async function readProducts(ctx: ExportReadContext): Promise<CommercialProductDef[]> {
    const { data, error } = await ctx.supabase
        .from("commercial_products")
        .select(
            "id, location_id, program_key, name, commercial_type, amount_cents, cadence_key, revenue_category_id, behavior, effective_start, effective_end, is_active",
        )
        .eq("org_id", ctx.orgId)
        .order("name", { ascending: true });
    if (error) throw new Error(`readProducts: ${error.message}`);

    return (data ?? []).map((raw) => {
        const r = raw as Record<string, unknown>;
        const ct = str(r.commercial_type);
        return {
            id: str(r.id),
            commercialType: (VALID_COMMERCIAL_TYPES as string[]).includes(ct) ? (ct as CommercialType) : "fee",
            name: str(r.name),
            scope: { programKey: str(r.program_key), locationId: nstr(r.location_id) },
            amountCents: Number(r.amount_cents ?? 0),
            cadenceKey: nstr(r.cadence_key),
            revenueCategoryId: nstr(r.revenue_category_id),
            behavior: obj(r.behavior),
            effective: { start: nstr(r.effective_start), end: nstr(r.effective_end) },
            isActive: r.is_active !== false,
        } satisfies CommercialProductDef;
    });
}

/**
 * Billing Cadences — Commercial-domain option set (`commercial_billing_cadence`).
 * Two-step read: resolve the org's option set, then its items. Returns empty when
 * the option set is not seeded (migration not yet run) — a warning, not an error.
 */
export async function readCadences(ctx: ExportReadContext): Promise<BillingCadenceDef[]> {
    const { data: setRow, error: setErr } = await ctx.supabase
        .from("option_sets")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("set_key", "commercial_billing_cadence")
        .maybeSingle();
    if (setErr) throw new Error(`readCadences(set): ${setErr.message}`);
    if (!setRow) return [];

    const { data, error } = await ctx.supabase
        .from("option_set_items")
        .select("item_key, label")
        .eq("option_set_id", (setRow as Record<string, unknown>).id)
        .order("sort_order", { ascending: true });
    if (error) throw new Error(`readCadences(items): ${error.message}`);

    return (data ?? []).map((raw) => {
        const r = raw as Record<string, unknown>;
        return {
            cadenceKey: str(r.item_key),
            label: str(r.label) || str(r.item_key),
            isActive: true, // option_set_items carry no is_active; presence = available
        } satisfies BillingCadenceDef;
    });
}

/** Revenue Categories → GL account mapping (Accounting reference). */
export async function readRevenueCategories(ctx: ExportReadContext): Promise<RevenueCategoryDef[]> {
    const { data, error } = await ctx.supabase
        .from("commercial_revenue_categories")
        .select("id, label, mapped_gl_account_id, is_active")
        .eq("org_id", ctx.orgId)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
    if (error) throw new Error(`readRevenueCategories: ${error.message}`);

    return (data ?? []).map((raw) => {
        const r = raw as Record<string, unknown>;
        return {
            id: str(r.id),
            label: str(r.label),
            glAccountId: nstr(r.mapped_gl_account_id),
            isActive: r.is_active !== false,
        } satisfies RevenueCategoryDef;
    });
}

/** Validation-only: the set of GL account ids for the org (to check mapped references resolve). */
export async function readGlAccountIds(ctx: ExportReadContext): Promise<Set<string>> {
    const { data, error } = await ctx.supabase.from("gl_accounts").select("id").eq("org_id", ctx.orgId);
    if (error) throw new Error(`readGlAccountIds: ${error.message}`);
    return new Set((data ?? []).map((r) => str((r as Record<string, unknown>).id)));
}
