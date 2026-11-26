/**
 * THE PAYERLESS ENROLLMENT LINKS AN OPERATOR MUST RESOLVE — read only.
 *
 * Lists active Enrollment links whose open paperwork names no payer (the family cannot pay from them).
 * Each row is resolved one at a time through GET/POST /api/admin/enrollment/links/[linkId]/payer, under
 * the same Enrollment decision authority (ENROLLMENT_DECIDE). Nothing is written here.
 */
import { NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { ENROLLMENT_DECIDE, requireEnrollmentCapability } from "@/lib/access/enrollmentAuthority";
import { listLinksNeedingPayer } from "@/lib/enrollment/participantLaunch/listLinksNeedingPayer";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const denied = requireEnrollmentCapability(access, ENROLLMENT_DECIDE);
    if (denied) return denied;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    try {
        const links = await listLinksNeedingPayer(createAdminClient(), { orgId: ctx.orgId });
        return NextResponse.json({ data: { links } });
    } catch (e) {
        console.error("[links needing payer] read failed", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "The links could not be read." }, { status: 500 });
    }
}
