import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

type CustomerRow = {
    id: string;
    created_at: string | null;
    updated_at: string | null;
    name: string | null;
    status: string | null;
    status_key: string | null;
    customer_type: string | null;
    primary_contact_id: string | null;
    vertical_id: string | null;
    org_id: string | null;
    metadata: Record<string, unknown> | null;
    stripe_customer_id: string | null;
    external_source: string | null;
    external_id: string | null;
    default_payment_method_id: string | null;
    payment_method_brand: string | null;
    payment_method_last4: string | null;
    setup_intent_id: string | null;
};

/** GET: list customers for org. Returns full rows with derived fields for table; also used by dropdowns (id, name). */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const statusKey = (searchParams.get("status_key") ?? "").trim();
    const limit = Math.min(Number(searchParams.get("limit")) || 500, 500);

    const supabase = createAdminClient();
    const selectCols = "id, created_at, updated_at, name, status, status_key, customer_type, primary_contact_id, vertical_id, org_id, metadata, stripe_customer_id, external_source, external_id, default_payment_method_id, payment_method_brand, payment_method_last4, setup_intent_id";
    let q = supabase
        .from("customers")
        .select(selectCols, { count: "exact" })
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(limit);
    if (statusKey) q = q.eq("status_key", statusKey);

    const { data: rows, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const list = (rows ?? []) as CustomerRow[];
    const primaryContactIds = [...new Set(list.map((r) => r.primary_contact_id).filter(Boolean))] as string[];
    const verticalIds = [...new Set(list.map((r) => r.vertical_id).filter(Boolean))] as string[];
    const customerIds = list.map((r) => r.id);

    let contactMap: Record<string, { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; person_id?: string | null }> = {};
    let personMap: Record<string, { first_name?: string | null; last_name?: string | null }> = {};
    if (primaryContactIds.length > 0) {
        const { data: contacts } = await supabase
            .from("contacts")
            .select("id, first_name, last_name, email, phone, person_id")
            .in("id", primaryContactIds);
        (contacts ?? []).forEach((c: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; person_id?: string | null }) => {
            contactMap[c.id] = { first_name: c.first_name, last_name: c.last_name, email: c.email, phone: c.phone, person_id: c.person_id };
        });
        const personIds = [...new Set((contacts ?? []).map((c: { person_id?: string | null }) => c.person_id).filter(Boolean))] as string[];
        if (personIds.length > 0) {
            const { data: persons } = await supabase.from("persons").select("id, first_name, last_name").in("id", personIds);
            (persons ?? []).forEach((p: { id: string; first_name?: string | null; last_name?: string | null }) => {
                personMap[p.id] = { first_name: p.first_name, last_name: p.last_name };
            });
        }
    }

    let verticalMap: Record<string, string> = {};
    if (verticalIds.length > 0) {
        const { data: verticals } = await supabase.from("verticals").select("id, name, slug").in("id", verticalIds);
        (verticals ?? []).forEach((v: { id: string; name?: string | null; slug?: string | null }) => {
            verticalMap[v.id] = v.name ?? v.slug ?? "—";
        });
    }

    const [jobsCountRes, oppCountRes] = await Promise.all([
        customerIds.length > 0 ? supabase.from("jobs").select("customer_id").in("customer_id", customerIds) : { data: [] as { customer_id: string }[] },
        customerIds.length > 0 ? supabase.from("opportunities").select("customer_id").in("customer_id", customerIds) : { data: [] as { customer_id: string }[] },
    ]);
    const jobCountByCustomer: Record<string, number> = {};
    (jobsCountRes.data ?? []).forEach((j: { customer_id: string }) => {
        jobCountByCustomer[j.customer_id] = (jobCountByCustomer[j.customer_id] ?? 0) + 1;
    });
    const oppCountByCustomer: Record<string, number> = {};
    (oppCountRes.data ?? []).forEach((o: { customer_id: string }) => {
        oppCountByCustomer[o.customer_id] = (oppCountByCustomer[o.customer_id] ?? 0) + 1;
    });

    const customers = list.map((r) => {
        const contact = r.primary_contact_id ? contactMap[r.primary_contact_id] : null;
        const _primary_contact_name = contact
            ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "—"
            : "—";
        const personId = contact?.person_id ?? null;
        const person = personId ? personMap[personId] : null;
        const _primary_person_name = person
            ? [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || "—"
            : (personId ? "—" : null);
        const _primary_person_id = personId ?? null;
        const _primary_contact_email = contact?.email ?? null;
        const _primary_contact_phone = contact?.phone ?? null;
        const meta = (r.metadata && typeof r.metadata === "object") ? (r.metadata as Record<string, unknown>) : {};
        const metaEmail = (meta.email as string) ?? null;
        const metaPhone = (meta.phone as string) ?? null;
        const _customer_email = _primary_contact_email ?? metaEmail ?? null;
        const _customer_phone = _primary_contact_phone ?? metaPhone;
        const _vertical_name = r.vertical_id ? (verticalMap[r.vertical_id] ?? null) : null;
        const _active_jobs_count = jobCountByCustomer[r.id] ?? 0;
        const _open_opportunities_count = oppCountByCustomer[r.id] ?? 0;
        const _updated = r.updated_at ?? r.created_at ?? null;
        return {
            ...r,
            _primary_person_name: _primary_person_name ?? undefined,
            _primary_person_id: _primary_person_id ?? undefined,
            _primary_contact_name,
            _primary_contact_email,
            _primary_contact_phone,
            _customer_email,
            _customer_phone: _customer_phone ?? null,
            _vertical_name,
            _active_jobs_count,
            _open_opportunities_count,
            _updated,
        };
    });

    return NextResponse.json({ customers, total: count ?? customers.length });
}
