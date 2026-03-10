import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";

export type DiscountRedemptionListItem = {
    id: string;
    created_at: string;
    discount_code_id: string;
    customer_id: string;
    contact_id: string | null;
    opportunity_id: string | null;
    job_id: string | null;
    quote_subtotal: number | null;
    discount_amount: number | null;
    quote_total: number | null;
    _code: string | null;
    _customer_name: string | null;
    _contact_name: string | null;
    _opportunity_name: string | null;
    _job_label: string | null;
    _subtotal_display: number | null;
    _discount_display: number | null;
    _total_display: number | null;
};

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    const offset = Number(searchParams.get("offset")) || 0;

    const supabase = createAdminClient();
    const { data: rows, error, count } = await supabase
        .from("discount_redemptions")
        .select("*", { count: "exact" })
        .order("redeemed_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = rows ?? [];
    const codeIds = [...new Set(list.map((r) => (r as { discount_code_id: string }).discount_code_id))];
    const customerIds = [...new Set(list.map((r) => (r as { customer_id: string }).customer_id).filter(Boolean))] as string[];
    const contactIds = [...new Set(list.map((r) => (r as { contact_id?: string | null }).contact_id).filter(Boolean))] as string[];
    const opportunityIds = [...new Set(list.map((r) => (r as { opportunity_id?: string | null }).opportunity_id).filter(Boolean))] as string[];
    const jobIds = [...new Set(list.map((r) => (r as { job_id?: string | null }).job_id).filter(Boolean))] as string[];

    const [codesRes, custRes, contactRes, oppRes, jobRes] = await Promise.all([
        codeIds.length ? supabase.from("discount_codes").select("id, code").in("id", codeIds) : { data: [] },
        customerIds.length ? supabase.from("customers").select("id, name").in("id", customerIds) : { data: [] },
        contactIds.length ? supabase.from("contacts").select("id, first_name, last_name").in("id", contactIds) : { data: [] },
        opportunityIds.length ? supabase.from("opportunities").select("id, name").in("id", opportunityIds) : { data: [] },
        jobIds.length ? supabase.from("jobs").select("id, title, service_key, job_number_for_customer").in("id", jobIds) : { data: [] },
    ]);

    const codeMap = new Map((codesRes.data ?? []).map((c) => [(c as { id: string }).id, (c as { code?: string | null }).code ?? null]));
    const customerMap = new Map((custRes.data ?? []).map((c) => [(c as { id: string }).id, (c as { name?: string | null }).name ?? null]));
    const contactMap = new Map((contactRes.data ?? []).map((c) => {
        const row = c as { id: string; first_name?: string | null; last_name?: string | null };
        const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || null;
        return [row.id, name];
    }));
    const oppMap = new Map((oppRes.data ?? []).map((o) => [(o as { id: string }).id, (o as { name?: string | null }).name ?? null]));
    const jobLabelMap = new Map((jobRes.data ?? []).map((j) => {
        const row = j as { id: string; title?: string | null; service_key?: string | null; job_number_for_customer?: string | null };
        const label = (row.title && String(row.title).trim()) || (row.service_key && String(row.service_key).trim()) || (row.job_number_for_customer && String(row.job_number_for_customer).trim()) || `Job #${row.id.slice(-6)}`;
        return [row.id, label];
    }));

    const redemptions: DiscountRedemptionListItem[] = list.map((r) => {
        const row = r as Record<string, unknown> & { discount_code_id: string; customer_id: string; contact_id?: string | null; opportunity_id?: string | null; job_id?: string | null; quote_subtotal?: number | null; discount_amount?: number | null; quote_total?: number | null };
        const createdAt = (row.created_at as string) ?? (row.redeemed_at as string) ?? "";
        return {
            id: row.id as string,
            created_at: createdAt,
            discount_code_id: row.discount_code_id,
            customer_id: row.customer_id,
            contact_id: row.contact_id ?? null,
            opportunity_id: row.opportunity_id ?? null,
            job_id: row.job_id ?? null,
            quote_subtotal: row.quote_subtotal ?? null,
            discount_amount: row.discount_amount ?? null,
            quote_total: row.quote_total ?? null,
            _code: codeMap.get(row.discount_code_id) ?? null,
            _customer_name: customerMap.get(row.customer_id) ?? null,
            _contact_name: row.contact_id ? contactMap.get(row.contact_id) ?? null : null,
            _opportunity_name: row.opportunity_id ? oppMap.get(row.opportunity_id) ?? null : null,
            _job_label: row.job_id ? jobLabelMap.get(row.job_id) ?? null : null,
            _subtotal_display: row.quote_subtotal ?? null,
            _discount_display: row.discount_amount ?? null,
            _total_display: row.quote_total ?? null,
        };
    });

    return NextResponse.json({
        redemptions,
        total: count ?? redemptions.length,
    });
}
