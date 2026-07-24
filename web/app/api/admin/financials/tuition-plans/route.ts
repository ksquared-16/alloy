/**
 * Composed Tuition Plans read model — offerings + variants + rates + supporting catalogs.
 * Presentation adapter only; no new tables.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import type { ProgramOffering } from "@/lib/programs/programOfferings";
import type { ProgramOfferingVariant } from "@/lib/programs/programOfferingVariants";
import type { TuitionRateRow } from "@/lib/commercial/tuitionRates";
import type { BillingCadence } from "@/lib/commercial/billingCadences";

function mapOffering(r: Record<string, unknown>): ProgramOffering {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        program_key: String(r.program_key ?? ""),
        label: String(r.label ?? ""),
        attendance_type: (r.attendance_type as ProgramOffering["attendance_type"]) ?? "full_time",
        status: (r.status as ProgramOffering["status"]) ?? "active",
        effective_start: (r.effective_start as string | null) ?? null,
        effective_end: (r.effective_end as string | null) ?? null,
        sort_order: Number(r.sort_order ?? 100),
        is_active: r.is_active !== false,
        metadata:
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : {},
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null) ?? null,
    };
}

function mapVariant(r: Record<string, unknown>): ProgramOfferingVariant {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        offering_id: String(r.offering_id ?? ""),
        label: (r.label as string | null) ?? null,
        quantity_type: (r.quantity_type as ProgramOfferingVariant["quantity_type"]) ?? null,
        quantity_value: r.quantity_value == null ? null : Number(r.quantity_value),
        sort_order: Number(r.sort_order ?? 100),
        is_active: r.is_active !== false,
        status: (r.status as ProgramOfferingVariant["status"]) ?? "active",
        metadata:
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : {},
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null) ?? null,
    };
}

function mapRate(r: Record<string, unknown>): TuitionRateRow {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        location_id: (r.location_id as string | null) ?? null,
        variant_id: String(r.variant_id ?? ""),
        cadence_key: String(r.cadence_key ?? ""),
        payer_type: String(r.payer_type ?? "private_pay"),
        rate_cents: Number(r.rate_cents ?? 0),
        is_active: r.is_active !== false,
        not_offered: r.not_offered === true,
        effective_start: (r.effective_start as string | null) ?? null,
        effective_end: (r.effective_end as string | null) ?? null,
        revenue_category_id: (r.revenue_category_id as string | null) ?? null,
        metadata:
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : {},
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null) ?? null,
    };
}

export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }

    const supabase = createAdminClient();

    const { data: cadenceSet } = await supabase
        .from("option_sets")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("set_key", "commercial_billing_cadence")
        .maybeSingle();

    const [
        offeringsRes,
        variantsRes,
        ratesRes,
        locationsRes,
        categoriesRes,
        cadenceItemsRes,
        revenueRes,
    ] = await Promise.all([
        supabase
            .from("program_offerings")
            .select(
                "id, org_id, program_key, label, attendance_type, status, effective_start, effective_end, sort_order, is_active, metadata, created_at, updated_at",
            )
            .eq("org_id", ctx.orgId)
            .order("program_key")
            .order("sort_order")
            .order("label"),
        supabase
            .from("program_offering_variants")
            .select(
                "id, org_id, offering_id, label, quantity_type, quantity_value, sort_order, is_active, status, metadata, created_at, updated_at",
            )
            .eq("org_id", ctx.orgId)
            .order("sort_order"),
        supabase
            .from("commercial_tuition_rates")
            .select(
                "id, org_id, location_id, variant_id, cadence_key, payer_type, rate_cents, is_active, not_offered, effective_start, effective_end, revenue_category_id, metadata, created_at, updated_at",
            )
            .eq("org_id", ctx.orgId),
        // locations has `label` (not `name`). Selecting `name` fails the query and previously
        // returned an empty list with the error swallowed — Tuition location pickers looked empty.
        supabase
            .from("locations")
            .select("id, label, location_type, is_active")
            .eq("org_id", ctx.orgId)
            .eq("location_type", "site")
            .order("label"),
        supabase
            .from("location_program_categories")
            .select("key, label, is_active")
            .eq("org_id", ctx.orgId),
        cadenceSet?.id
            ? supabase
                  .from("option_set_items")
                  .select("id, item_key, label, sort_order, metadata")
                  .eq("option_set_id", cadenceSet.id)
                  .order("sort_order")
                  .order("label")
            : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
        supabase
            .from("commercial_revenue_categories")
            .select("id, label, mapped_gl_account_id")
            .eq("org_id", ctx.orgId)
            .order("label"),
    ]);

    if (offeringsRes.error) {
        return NextResponse.json({ error: offeringsRes.error.message }, { status: 500 });
    }
    if (variantsRes.error) {
        return NextResponse.json({ error: variantsRes.error.message }, { status: 500 });
    }
    if (ratesRes.error) {
        return NextResponse.json({ error: ratesRes.error.message }, { status: 500 });
    }
    if (locationsRes.error) {
        return NextResponse.json({ error: locationsRes.error.message }, { status: 500 });
    }

    const byKey = new Map<string, { label: string; siteCount: number }>();
    for (const row of categoriesRes.data ?? []) {
        const programKey = String((row as { key?: string }).key ?? "");
        if (!programKey) continue;
        if (!byKey.has(programKey)) {
            byKey.set(programKey, {
                label: String((row as { label?: string }).label ?? programKey),
                siteCount: 0,
            });
        }
        if ((row as { is_active?: boolean }).is_active !== false) {
            byKey.get(programKey)!.siteCount += 1;
        }
    }

    const cadences: BillingCadence[] = (cadenceItemsRes.data ?? []).map((row) => {
        const item = row as Record<string, unknown>;
        return {
            id: String(item.id ?? ""),
            item_key: String(item.item_key ?? ""),
            label: String(item.label ?? ""),
            sort_order: Number(item.sort_order ?? 100),
            metadata:
                item.metadata != null && typeof item.metadata === "object" && !Array.isArray(item.metadata)
                    ? (item.metadata as Record<string, unknown>)
                    : {},
        };
    });

    return NextResponse.json({
        offerings: (offeringsRes.data ?? []).map((row) => mapOffering(row as Record<string, unknown>)),
        variants: (variantsRes.data ?? []).map((row) => mapVariant(row as Record<string, unknown>)),
        rates: (ratesRes.data ?? []).map((row) => mapRate(row as Record<string, unknown>)),
        locations: (locationsRes.data ?? [])
            .map((row) => ({
                id: String((row as { id?: string }).id ?? ""),
                name: String((row as { label?: string | null }).label ?? "").trim() || "Unnamed site",
                isActive: (row as { is_active?: boolean | null }).is_active !== false,
            }))
            .filter((row) => row.id),
        programs: Array.from(byKey.entries()).map(([programKey, value]) => ({
            key: programKey,
            label: value.label,
            siteCount: value.siteCount,
        })),
        cadences,
        revenue_categories: (revenueRes.data ?? []).map((row) => ({
            id: String((row as { id?: string }).id ?? ""),
            label: String((row as { label?: string }).label ?? ""),
            mapped_gl_account_id: (row as { mapped_gl_account_id?: string | null }).mapped_gl_account_id ?? null,
        })),
    });
}
