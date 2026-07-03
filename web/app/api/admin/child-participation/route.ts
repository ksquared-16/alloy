import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    applyChildParticipationEdit,
    type ChildParticipationPatch,
} from "@/lib/childcareOperational/applyChildParticipationEdit";

/**
 * Participation-detail edit for a child (program/room/site/schedule/start/notes). Routes to the
 * process instance (pre-materialization) or the durable operational model (post-materialization).
 * Never creates or writes opportunity_customer_members.
 */
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

    const customerMemberId = typeof body.customer_member_id === "string" ? body.customer_member_id.trim() : "";
    if (!customerMemberId) {
        return NextResponse.json({ error: "Missing customer_member_id" }, { status: 400 });
    }
    const opportunityId = typeof body.opportunity_id === "string" && body.opportunity_id.trim() ? body.opportunity_id.trim() : null;
    const patch = (body.patch ?? {}) as ChildParticipationPatch;

    const supabase = createAdminClient();
    const result = await applyChildParticipationEdit(supabase, {
        orgId: ctx.orgId,
        customerMemberId,
        opportunityId,
        patch,
        actorUserId: ctx.userId,
    });
    if (!result.ok) {
        return NextResponse.json({ error: result.error ?? "Participation edit failed", routed: result.routed }, { status: 400 });
    }
    return NextResponse.json(result);
}
