import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { ENROLLMENT_RECORD_MANAGE, requireEnrollmentCapability } from "@/lib/access/enrollmentAuthority";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { ensureOpportunityCustomerMemberParticipation } from "@/lib/lifecycle/ensureOpportunityCustomerMemberParticipation";

/** POST: link a household child member to an opportunity (creates OCM join row). */
export async function POST(request: NextRequest) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    /*
     * ENROLLMENT RECORD AUTHORITY - adding a child to an inquiry is candidacy, not contact
     * identity.
     *
     * Authority here was PORTAL ADMISSION - `requireAdminOrOps()` resolves admission and no
     * role. It is a grant now, and nothing else.
     */
    const capDenied = requireEnrollmentCapability(access, ENROLLMENT_RECORD_MANAGE);
    if (capDenied) return capDenied;

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

    /*
     * ONE WRITER FOR A CHILD'S PARTICIPATION IN THIS LEAD.
     *
     * Every other Add Child path (the Manage wizard, link existing, Create Lead, Forms → Processing,
     * Start Enrollment) records the lead↔child participation through
     * `ensureOpportunityCustomerMemberParticipation`. This route — the one the Focus Panel's Add Child
     * uses — inserted its own row and left the child's initial state empty, so the same act produced a
     * different participation shape depending on which button the operator pressed. It now uses the
     * same writer, with the same find-or-create semantics and the same initial state.
     */
    let participation: { ocmId: string; created: boolean };
    try {
        participation = await ensureOpportunityCustomerMemberParticipation({
            supabase,
            orgId: ctx.orgId,
            opportunityId,
            customerMemberId,
            source: "add_inquiry_child",
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Could not link the child" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("opportunity_customer_members")
        .select(
            "id, org_id, opportunity_id, customer_member_id, program_category_id, schedule_type, start_date, outcome_status_key, notes, updated_at"
        )
        .eq("org_id", ctx.orgId)
        .eq("id", participation.ocmId)
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
}
