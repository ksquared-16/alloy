import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { ENROLLMENT_RECORD_MANAGE, requireEnrollmentCapability } from "@/lib/access/enrollmentAuthority";
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
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    /*
     * ENROLLMENT RECORD AUTHORITY - edits a child's requested program, room, site, schedule and
     * start.
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
