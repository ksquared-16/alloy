import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";

const ALLOWED_KEYS = [
    "desired_program_type",
    "desired_schedule_type",
    "outcome_status_key",
    "notes",
] as const;

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    for (const k of ALLOWED_KEYS) {
        if (body[k] === undefined) continue;
        const v = body[k];
        if (k === "notes") {
            updates.notes = typeof v === "string" ? v : v == null ? null : String(v);
            continue;
        }
        updates[k] = v === "" || v == null ? null : typeof v === "string" ? v.trim() || null : v;
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunity_customer_members", id, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data, error } = await supabase
        .from("opportunity_customer_members")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select(
            "id, org_id, opportunity_id, customer_member_id, desired_program_type, desired_schedule_type, outcome_status_key, notes, updated_at"
        )
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(data);
}

