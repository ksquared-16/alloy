import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

/** GET: single customer_member by id. Admin + ops can read. */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: row, error } = await supabase
        .from("customer_members")
        .select("id, org_id, customer_id, person_id, display_name, relationship, first_name, last_name, dob, is_active, metadata, created_at, updated_at")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const out: Record<string, unknown> = { ...row };
    const customerId = (row as { customer_id: string | null }).customer_id;
    if (customerId) {
        const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
        (out as Record<string, unknown>)._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
    } else {
        (out as Record<string, unknown>)._customer_name = null;
    }
    return NextResponse.json(out);
}

/** PATCH: update customer_member. Admin only. */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    let body: {
        display_name?: string;
        relationship?: string;
        first_name?: string;
        last_name?: string;
        dob?: string | null;
        is_active?: boolean;
        external_source?: string | null;
        external_id?: string | null;
        metadata?: Record<string, unknown>;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const updates: Record<string, unknown> = {};
    if (typeof body.display_name === "string") updates.display_name = body.display_name.trim();
    if (body.relationship !== undefined) updates.relationship = typeof body.relationship === "string" ? body.relationship.trim() || null : null;
    if (body.first_name !== undefined) updates.first_name = typeof body.first_name === "string" ? body.first_name.trim() || null : null;
    if (body.last_name !== undefined) updates.last_name = typeof body.last_name === "string" ? body.last_name.trim() || null : null;
    if (body.dob !== undefined) updates.dob = typeof body.dob === "string" && body.dob.trim() ? body.dob.trim() : null;
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
    if (body.external_source !== undefined) updates.external_source = typeof body.external_source === "string" ? body.external_source.trim() || null : null;
    if (body.external_id !== undefined) updates.external_id = typeof body.external_id === "string" ? body.external_id.trim() || null : null;
    if (body.metadata !== undefined) updates.metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : null;

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("customer_members")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select("id, customer_id, display_name, relationship, first_name, last_name, dob, is_active, created_at")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    return NextResponse.json(data);
}

/** DELETE: hard delete customer_member. Admin only. */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
        .from("customer_members")
        .delete()
        .eq("id", id)
        .eq("org_id", ctx.orgId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
