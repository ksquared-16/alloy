import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";

/** POST: link a household child member to an opportunity (creates OCM join row). */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const opportunityId = typeof body.opportunity_id === "string" ? body.opportunity_id.trim() : "";
    const customerMemberId =
        typeof body.customer_member_id === "string" ? body.customer_member_id.trim() : "";
    if (!opportunityId || !customerMemberId) {
        return NextResponse.json({ error: "opportunity_id and customer_member_id are required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", opportunityId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await assertRowOrg(supabase, "customer_members", customerMemberId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: opp } = await supabase
        .from("opportunities")
        .select("customer_id")
        .eq("id", opportunityId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    const { data: member } = await supabase
        .from("customer_members")
        .select("customer_id, relationship, is_active")
        .eq("id", customerMemberId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    const oppCustomerId = (opp as { customer_id?: string | null } | null)?.customer_id ?? null;
    const memberCustomerId = (member as { customer_id?: string | null } | null)?.customer_id ?? null;
    if (!oppCustomerId || !memberCustomerId || oppCustomerId !== memberCustomerId) {
        return NextResponse.json(
            { error: "Child member must belong to the opportunity customer account" },
            { status: 400 }
        );
    }

    const rel = String((member as { relationship?: string | null })?.relationship ?? "")
        .trim()
        .toLowerCase();
    if (rel !== "child" || (member as { is_active?: boolean | null })?.is_active !== true) {
        return NextResponse.json({ error: "Member must be an active child" }, { status: 400 });
    }

    const { data: existing } = await supabase
        .from("opportunity_customer_members")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("opportunity_id", opportunityId)
        .eq("customer_member_id", customerMemberId)
        .maybeSingle();
    if (existing?.id) {
        return NextResponse.json(existing);
    }

    const { data, error } = await supabase
        .from("opportunity_customer_members")
        .insert({
            org_id: ctx.orgId,
            opportunity_id: opportunityId,
            customer_member_id: customerMemberId,
        })
        .select(
            "id, org_id, opportunity_id, customer_member_id, program_category_id, schedule_type, start_date, outcome_status_key, notes, updated_at"
        )
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
}
