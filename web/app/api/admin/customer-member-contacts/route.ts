import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list customer_member_contacts for a member. Query: customer_member_id. Admin + ops can read. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const customerMemberId = searchParams.get("customer_member_id")?.trim();
    if (!customerMemberId) {
        return NextResponse.json({ error: "customer_member_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("customer_member_contacts")
        .select(`
            id,
            customer_member_id,
            contact_id,
            role_key,
            is_active,
            contact:contacts(id, first_name, last_name, email, phone)
        `)
        .eq("org_id", ctx.orgId)
        .eq("customer_member_id", customerMemberId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const links = (rows ?? []).map((row: Record<string, unknown>) => {
        const nested = (row.contact ?? row.contacts) as { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null;
        return {
            id: row.id,
            customer_member_id: row.customer_member_id,
            contact_id: row.contact_id,
            role_key: row.role_key,
            is_active: row.is_active,
            contact: nested
                ? {
                    id: nested.id,
                    first_name: nested.first_name ?? null,
                    last_name: nested.last_name ?? null,
                    email: nested.email ?? null,
                    phone: nested.phone ?? null,
                }
                : { id: row.contact_id as string, first_name: null, last_name: null, email: null, phone: null },
        };
    });

    return NextResponse.json({ links });
}

/** POST: create a customer_member_contact link. Admin only. */
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

    let body: { customer_member_id?: string; contact_id?: string; role_key?: string } = {};
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const customerMemberId = typeof body.customer_member_id === "string" ? body.customer_member_id.trim() : "";
    const contactId = typeof body.contact_id === "string" ? body.contact_id.trim() : "";
    const roleKey = typeof body.role_key === "string" ? body.role_key.trim() : "";

    if (!customerMemberId || !contactId || !roleKey) {
        return NextResponse.json({ error: "customer_member_id, contact_id, and role_key are required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: member, error: memberErr } = await supabase
        .from("customer_members")
        .select("id, customer_id, org_id")
        .eq("id", customerMemberId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (memberErr || !member) {
        return NextResponse.json({ error: "Customer member not found or access denied" }, { status: 404 });
    }

    const customerId = (member as { customer_id: string }).customer_id;
    if (!customerId) {
        return NextResponse.json({ error: "Customer member has no customer" }, { status: 400 });
    }

    const { data: contact, error: contactErr } = await supabase
        .from("contacts")
        .select("id, org_id")
        .eq("id", contactId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (contactErr || !contact) {
        return NextResponse.json({ error: "Contact not found or access denied" }, { status: 404 });
    }

    const { data: roleRow, error: roleErr } = await supabase
        .from("customer_member_contact_roles")
        .select("role_key")
        .eq("org_id", ctx.orgId)
        .eq("role_key", roleKey)
        .eq("is_active", true)
        .maybeSingle();

    if (roleErr || !roleRow) {
        return NextResponse.json({ error: "Invalid or inactive role_key" }, { status: 400 });
    }

    const { data: inserted, error: insertErr } = await supabase
        .from("customer_member_contacts")
        .insert({
            org_id: ctx.orgId,
            customer_id: customerId,
            customer_member_id: customerMemberId,
            contact_id: contactId,
            role_key: roleKey,
            is_active: true,
        })
        .select()
        .single();

    if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json(inserted);
}
