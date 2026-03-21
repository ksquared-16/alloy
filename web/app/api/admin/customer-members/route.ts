import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { displayLabelsFromDefinitions, fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

/** GET: list customer_members for org. Optional ?customer_id= filter. Admin + ops can read. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const customerId = request.nextUrl.searchParams.get("customer_id")?.trim() || undefined;
    const statusKey = request.nextUrl.searchParams.get("status_key")?.trim() || undefined;
    const supabase = createAdminClient();

    let query = supabase
        .from("customer_members")
        .select("id, customer_id, display_name, relationship, first_name, last_name, dob, is_active, status_key, created_at, updated_at")
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false });

    if (customerId) {
        query = query.eq("customer_id", customerId);
    }
    if (statusKey) {
        query = query.eq("status_key", statusKey);
    }

    const { data: rows, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const memberIds = (rows ?? []).map((r) => (r as { id: string }).id);
    const customerIds = [...new Set((rows ?? []).map((r) => (r as { customer_id: string }).customer_id).filter(Boolean))];

    const [customerRows, relationshipRows, linkCounts] = await Promise.all([
        customerIds.length
            ? supabase.from("customers").select("id, name").in("id", customerIds)
            : { data: [] as { id: string; name: string | null }[] },
        supabase.from("customer_member_relationship_types").select("key, label").eq("org_id", ctx.orgId).eq("is_active", true),
        memberIds.length
            ? supabase.from("customer_member_contacts").select("customer_member_id").eq("org_id", ctx.orgId).in("customer_member_id", memberIds)
            : { data: [] as { customer_member_id: string }[] },
    ]);

    const customerMap = new Map((customerRows.data ?? []).map((c) => [c.id, c.name ?? null]));
    const relationshipMap = new Map((relationshipRows.data ?? []).map((r: { key: string; label: string | null }) => [r.key, r.label ?? r.key]));
    const countByMember = new Map<string, number>();
    for (const link of linkCounts.data ?? []) {
        const mid = (link as { customer_member_id: string }).customer_member_id;
        countByMember.set(mid, (countByMember.get(mid) ?? 0) + 1);
    }

    function ageFromDob(dob: string | null): number | null {
        if (!dob || !dob.trim()) return null;
        const d = new Date(dob);
        if (Number.isNaN(d.getTime())) return null;
        const today = new Date();
        let age = today.getFullYear() - d.getFullYear();
        if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
        return age >= 0 ? age : null;
    }

    const memberDefs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "customer_members", { activeOnly: true });
    const memberStatusLabels = displayLabelsFromDefinitions(memberDefs);

    const members = (rows ?? []).map((r) => {
        const id = (r as { id: string }).id;
        const relationshipKey = (r as { relationship: string | null }).relationship ?? null;
        const created_at = (r as { created_at: string }).created_at;
        const updated_at = (r as { updated_at?: string | null }).updated_at ?? null;
        const sk = (r as { status_key?: string | null }).status_key ?? null;
        const _status_display =
            sk != null && String(sk).trim() !== ""
                ? (memberStatusLabels.get(String(sk).trim()) ?? String(sk).trim())
                : null;
        return {
            id,
            customer_id: (r as { customer_id: string }).customer_id,
            display_name: (r as { display_name: string | null }).display_name ?? null,
            relationship: relationshipKey,
            first_name: (r as { first_name: string | null }).first_name ?? null,
            last_name: (r as { last_name: string | null }).last_name ?? null,
            dob: (r as { dob: string | null }).dob ?? null,
            is_active: (r as { is_active: boolean }).is_active ?? true,
            status_key: sk,
            created_at,
            updated_at,
            _status_display,
            _customer_name: customerMap.get((r as { customer_id: string }).customer_id) ?? null,
            _relationship_label: relationshipKey ? (relationshipMap.get(relationshipKey) ?? relationshipKey) : null,
            _age: ageFromDob((r as { dob: string | null }).dob),
            _linked_contacts_count: countByMember.get(id) ?? 0,
            _updated: updated_at || created_at,
        };
    });

    return NextResponse.json({ members });
}

/** POST: create customer_member. Admin only. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: {
        customer_id?: string;
        display_name?: string;
        relationship?: string;
        first_name?: string;
        last_name?: string;
        dob?: string | null;
        is_active?: boolean;
        status_key?: string | null;
        metadata?: Record<string, unknown>;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const customer_id = typeof body.customer_id === "string" ? body.customer_id.trim() : "";
    if (!customer_id) {
        return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
    }

    const display_name = typeof body.display_name === "string" ? body.display_name.trim() : "";
    if (!display_name) {
        return NextResponse.json({ error: "display_name is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: customer, error: custErr } = await supabase
        .from("customers")
        .select("id")
        .eq("id", customer_id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (custErr || !customer) {
        return NextResponse.json({ error: "Customer not found or not in your org" }, { status: 400 });
    }

    const status_key = typeof body.status_key === "string" && body.status_key.trim() ? body.status_key.trim() : null;
    const { data: inserted, error: insertErr } = await supabase
        .from("customer_members")
        .insert({
            org_id: ctx.orgId,
            customer_id,
            display_name,
            relationship: typeof body.relationship === "string" ? body.relationship.trim() || null : null,
            first_name: typeof body.first_name === "string" ? body.first_name.trim() || null : null,
            last_name: typeof body.last_name === "string" ? body.last_name.trim() || null : null,
            dob: typeof body.dob === "string" && body.dob.trim() ? body.dob.trim() : null,
            is_active: body.is_active !== false,
            status_key,
            metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : null,
        })
        .select("id, customer_id, display_name, relationship, first_name, last_name, dob, is_active, status_key, created_at")
        .single();

    if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json(inserted);
}
