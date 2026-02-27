import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

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
        .select("id, customer_id, display_name, relationship, first_name, last_name, dob, is_active, status_key, created_at")
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

    const members = (rows ?? []).map((r) => ({
        id: (r as { id: string }).id,
        customer_id: (r as { customer_id: string }).customer_id,
        display_name: (r as { display_name: string | null }).display_name ?? null,
        relationship: (r as { relationship: string | null }).relationship ?? null,
        first_name: (r as { first_name: string | null }).first_name ?? null,
        last_name: (r as { last_name: string | null }).last_name ?? null,
        dob: (r as { dob: string | null }).dob ?? null,
        is_active: (r as { is_active: boolean }).is_active ?? true,
        status_key: (r as { status_key?: string | null }).status_key ?? null,
        created_at: (r as { created_at: string }).created_at,
    }));

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
