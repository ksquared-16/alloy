/**
 * GIVE A PAYERLESS ENROLLMENT LINK ITS PAYER — review, then confirm. One link per request.
 *
 * GET previews: is this an active Enrollment link with no payer and open paperwork, and who are its
 * household's primary contacts (the candidates)? Nothing is written. POST binds the payer the operator
 * chose, with `confirm: true`, only if the link STILL has no payer (compare-and-set). The authority is
 * linkPayerBinding — this route parses, authorizes and maps refusals.
 *
 * Enrollment decision authority (ENROLLMENT_DECIDE): naming who may pay from a family's paperwork is an
 * Enrollment decision, not ordinary launch work.
 */
import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { ENROLLMENT_DECIDE, requireEnrollmentCapability } from "@/lib/access/enrollmentAuthority";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { bindLinkPayer, previewLinkPayerBinding, type LinkPayerRefusal } from "@/lib/enrollment/participantLaunch/linkPayerBinding";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const STATUS: Record<LinkPayerRefusal["code"], number> = {
    link_not_found: 404,
    not_an_enrollment_link: 409,
    link_inactive: 409,
    payer_already_bound: 409,
    session_not_open: 409,
    no_household: 409,
    no_primary_contact: 409,
    payer_not_a_candidate: 422,
    confirmation_required: 400,
};
const refused = (r: LinkPayerRefusal) => NextResponse.json({ error: r.detail, code: r.code }, { status: STATUS[r.code] });

/** Organization context and the link id — after the handler's own capability check. */
async function resolveTarget(params: Promise<{ linkId: string }>) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return { response: adminContextFailureResponse(ctx) };
    const linkId = parseUuidParam((await params).linkId, "linkId");
    if (linkId instanceof NextResponse) return { response: linkId };
    return { ctx, linkId };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ linkId: string }> }) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const denied = requireEnrollmentCapability(access, ENROLLMENT_DECIDE);
    if (denied) return denied;
    const a = await resolveTarget(params);
    if ("response" in a) return a.response;
    try {
        const preview = await previewLinkPayerBinding(createAdminClient(), { orgId: a.ctx.orgId, linkId: a.linkId });
        if (!preview.ok) return refused(preview.refusal);
        return NextResponse.json({ data: preview.value });
    } catch (e) {
        console.error("[link payer] preview failed", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "The link could not be read." }, { status: 500 });
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ linkId: string }> }) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const denied = requireEnrollmentCapability(access, ENROLLMENT_DECIDE);
    if (denied) return denied;
    const a = await resolveTarget(params);
    if ("response" in a) return a.response;
    let body: { person_id?: unknown; confirm?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const personId = parseUuidParam(typeof body.person_id === "string" ? body.person_id : undefined, "person_id");
    if (personId instanceof NextResponse) return personId;
    try {
        const bound = await bindLinkPayer(createAdminClient(), {
            orgId: a.ctx.orgId,
            linkId: a.linkId,
            personId,
            confirmed: body.confirm === true,
            actorUserId: a.ctx.userId,
        });
        if (!bound.ok) return refused(bound.refusal);
        return NextResponse.json({ data: bound.value });
    } catch (e) {
        console.error("[link payer] bind failed", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "The payer could not be recorded." }, { status: 500 });
    }
}
