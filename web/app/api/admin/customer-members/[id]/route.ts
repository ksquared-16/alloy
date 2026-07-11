import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { applyCustomerMemberMutationPatch } from "@/lib/admin/customerMemberPatch";
import { loadCustomerMemberProfileFieldsByMemberId } from "@/lib/completion/loadCustomerMemberProfileFields";

const CUSTOMER_MEMBER_SELECT =
    "id, org_id, customer_id, person_id, display_name, relationship, first_name, last_name, dob, is_active, metadata, created_at, updated_at";

/** GET: single customer_member by id with merged native + config profile fields. Admin + ops can read. */
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
        .select(CUSTOMER_MEMBER_SELECT)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const profileByMember = await loadCustomerMemberProfileFieldsByMemberId(supabase, ctx.orgId, [id]);
    const profile = profileByMember.get(id) ?? {};

    const out: Record<string, unknown> = {
        ...(row as Record<string, unknown>),
        preferred_name: profile.preferred_name ?? null,
        gender: profile.gender ?? null,
        allergies: profile.allergies ?? null,
        medical_notes: profile.medical_notes ?? null,
        special_instructions: profile.special_instructions ?? null,
    };

    const customerId = (row as { customer_id: string | null }).customer_id;
    if (customerId) {
        const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
        out._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
    } else {
        out._customer_name = null;
    }
    return NextResponse.json(out);
}

/** PATCH: update customer_member native columns + customer_member config field_values. Admin only. */
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

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const applied = await applyCustomerMemberMutationPatch({
        supabase,
        orgId: ctx.orgId,
        memberId: id,
        body,
    });
    if (!applied.ok) {
        return NextResponse.json({ error: applied.error }, { status: applied.status ?? 500 });
    }

    const profileByMember = await loadCustomerMemberProfileFieldsByMemberId(supabase, ctx.orgId, [id]);
    const profile = profileByMember.get(id) ?? {};

    const { data: row } = await supabase
        .from("customer_members")
        .select(CUSTOMER_MEMBER_SELECT)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .single();

    return NextResponse.json({
        ...(row ?? { id }),
        preferred_name: profile.preferred_name ?? null,
        gender: profile.gender ?? null,
        allergies: profile.allergies ?? null,
        medical_notes: profile.medical_notes ?? null,
        special_instructions: profile.special_instructions ?? null,
    });
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
