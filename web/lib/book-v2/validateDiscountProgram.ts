/**
 * Runtime promo validation against discount_programs (via discount_programs_admin_v).
 * Used by /api/book-v2/validate-promo — not legacy discount_codes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { discountProgramRowSelectableForJobAdmin } from "@/lib/admin/jobDiscountSelection";

export type ValidatePromoSuccess = {
    valid: true;
    discount_program_id: string;
    discount_program_code: string;
    discount_program_name: string | null;
    program_type: string | null;
    benefit_type: string | null;
    applies_to: string | null;
    discount_amount: number;
    quote_total: number;
    /** Only when program is linked to a legacy code (optional). */
    discount_code_id: string | null;
    metadata: {
        primary_benefit_type: string | null;
        commitment_rule_id: string | null;
        enrollment_mode: string | null;
        required_service_count: number | null;
        timeframe_days: number | null;
    };
};

export type ValidatePromoFailure = {
    valid: false;
    reason: string;
    message?: string;
};

async function loadVerticalSlugsForProgram(supabase: SupabaseClient, programId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from("discount_program_qualifiers")
        .select("value_json")
        .eq("discount_program_id", programId)
        .eq("qualifier_type", "vertical_slug_in");
    if (error || !data?.length) return [];
    const slugs = new Set<string>();
    for (const q of data as { value_json: unknown }[]) {
        const v = q.value_json;
        if (v && typeof v === "object" && !Array.isArray(v)) {
            const vals = (v as { values?: unknown }).values;
            if (Array.isArray(vals)) {
                for (const x of vals) {
                    const s = String(x).trim();
                    if (s) slugs.add(s);
                }
            }
        }
    }
    return [...slugs];
}

function computeDiscountDollarsFromProgramView(row: Record<string, unknown>, subtotalDollars: number): number {
    const gross = Math.max(0, Number(subtotalDollars) || 0);
    const grossCents = Math.round(gross * 100);
    const benefitType = String(row.primary_benefit_type ?? "").trim();
    if (benefitType === "percent_off") {
        const bps = Number(row.primary_benefit_percent_basis_points ?? row.percent_basis_points ?? 0);
        const percent = Math.min(100, Math.max(0, bps / 100));
        const cents = Math.round(grossCents * (percent / 100));
        return Math.round(cents) / 100;
    }
    if (benefitType === "fixed_amount_off") {
        const cents = Math.round(Number(row.primary_benefit_amount_cents ?? row.amount_cents ?? 0));
        const applied = Math.min(grossCents, Math.max(0, cents));
        return Math.round(applied) / 100;
    }
    if (benefitType === "free_service") {
        return gross;
    }
    return 0;
}

async function findCustomerIdForPromoCheck(
    supabase: SupabaseClient,
    params: { email: string | null | undefined; phone: string | null | undefined; org_id: string | null }
): Promise<string | null> {
    const { email, phone, org_id } = params;
    if (email && String(email).trim()) {
        let q = supabase.from("contacts").select("customer_id").ilike("email", String(email).trim());
        if (org_id) q = q.eq("org_id", org_id);
        const { data } = await q.limit(1).maybeSingle();
        const cid = (data as { customer_id?: string | null } | null)?.customer_id;
        if (cid) return cid;
    }
    if (phone && String(phone).trim()) {
        let q = supabase.from("contacts").select("customer_id").eq("phone", String(phone).trim());
        if (org_id) q = q.eq("org_id", org_id);
        const { data } = await q.limit(1).maybeSingle();
        const cid = (data as { customer_id?: string | null } | null)?.customer_id;
        if (cid) return cid;
    }
    return null;
}

export async function validateDiscountProgramForPublicBooking(
    supabase: SupabaseClient,
    params: {
        code: string;
        quote_subtotal: number;
        vertical_key: string;
        email?: string | null;
        phone?: string | null;
    }
): Promise<ValidatePromoSuccess | ValidatePromoFailure> {
    const codeNormalized = params.code.trim().toUpperCase();
    if (!codeNormalized) {
        return { valid: false, reason: "invalid", message: "Promo code is required." };
    }

    const publicOrgId = process.env.ALLOY_PUBLIC_ORG_ID ?? null;

    const { data: rows, error } = await supabase.from("discount_programs_admin_v").select("*").ilike("code", codeNormalized);

    if (error) {
        console.error("[VALIDATE_PROMO] view query failed", error.message);
        return { valid: false, reason: "service_error", message: "Could not validate promo. Try again." };
    }

    const candidates = (rows ?? []).filter(
        (r) => String((r as Record<string, unknown>).code ?? "").trim().toUpperCase() === codeNormalized
    );

    const row = candidates.find((r) => {
        const org = (r as Record<string, unknown>).org_id as string | null | undefined;
        if (!org) return true;
        if (!publicOrgId) return true;
        return org === publicOrgId;
    }) as Record<string, unknown> | undefined;

    if (!row || !row.id) {
        return { valid: false, reason: "invalid", message: "Invalid or unavailable promo code." };
    }

    const programId = String(row.id);

    if (!discountProgramRowSelectableForJobAdmin(row)) {
        return { valid: false, reason: "invalid", message: "This promo is not active or has expired." };
    }

    const rowOrg = row.org_id as string | null | undefined;
    if (rowOrg && publicOrgId && rowOrg !== publicOrgId) {
        return { valid: false, reason: "invalid", message: "Invalid or unavailable promo code." };
    }

    const verticalSlugs = await loadVerticalSlugsForProgram(supabase, programId);
    const vKey = (params.vertical_key ?? "cleaning").trim();
    if (verticalSlugs.length > 0 && !verticalSlugs.includes(vKey)) {
        return { valid: false, reason: "invalid", message: "This promo does not apply to this service." };
    }

    const subtotal = Math.max(0, Number(params.quote_subtotal) || 0);
    const discount_amount = Math.round(computeDiscountDollarsFromProgramView(row, subtotal) * 100) / 100;
    const quote_total = Math.max(Math.round((subtotal - discount_amount) * 100) / 100, 0);

    const legacyCodeId = (row.legacy_discount_code_id as string | null | undefined) ?? null;

    const customerId = await findCustomerIdForPromoCheck(supabase, {
        email: params.email,
        phone: params.phone,
        org_id: publicOrgId,
    });

    if (customerId) {
        const { data: progRedeem } = await supabase
            .from("discount_redemptions")
            .select("id")
            .eq("discount_program_id", programId)
            .eq("customer_id", customerId)
            .limit(1)
            .maybeSingle();
        if (progRedeem) {
            return {
                valid: false,
                reason: "discount_already_used",
                message: "That promo code has already been used for this customer.",
            };
        }
        if (legacyCodeId) {
            const { data: codeRedeem } = await supabase
                .from("discount_redemptions")
                .select("id")
                .eq("discount_code_id", legacyCodeId)
                .eq("customer_id", customerId)
                .limit(1)
                .maybeSingle();
            if (codeRedeem) {
                return {
                    valid: false,
                    reason: "discount_already_used",
                    message: "That promo code has already been used for this customer.",
                };
            }
        }
    }

    const name = (row.name as string | null | undefined) ?? null;
    const programType = (row.program_type as string | null | undefined) ?? null;
    const benefitType = (row.primary_benefit_type as string | null | undefined) ?? null;
    const appliesTo = (row.primary_benefit_applies_to as string | null | undefined) ?? null;

    return {
        valid: true,
        discount_program_id: programId,
        discount_program_code: (row.code as string | null | undefined)?.trim() || codeNormalized,
        discount_program_name: name,
        program_type: programType,
        benefit_type: benefitType,
        applies_to: appliesTo,
        discount_amount,
        quote_total,
        discount_code_id: legacyCodeId,
        metadata: {
            primary_benefit_type: benefitType,
            commitment_rule_id: (row.commitment_rule_id as string | null | undefined) ?? null,
            enrollment_mode: (row.enrollment_mode as string | null | undefined) ?? null,
            required_service_count:
                row.required_service_count != null ? Number(row.required_service_count) : null,
            timeframe_days: row.timeframe_days != null ? Number(row.timeframe_days) : null,
        },
    };
}
