import { NextRequest, NextResponse } from "next/server";
import { formsReadScope, formsSubjectInActorScope, namedSubject } from "@/lib/forms/formSubmissionScope";
import { formsDestinationInActorScope, linkMetadataDestination } from "@/lib/forms/formsDestinationScope";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import { mintPacketPublicLinkForAdmin } from "@/lib/forms/packets/mintPacketPublicLinkForAdmin";
import { resolvePublicAppOrigin } from "@/lib/publicAppUrl";
import { FORMS_SUBMISSIONS, requireFormsCapability } from "@/lib/access/formsAuthority";

/**
 * The origin these public/embed links are built on.
 *
 * It is read from the ONE canonical public-origin authority and NOT from the request.
 * These links are copied into emails, texts and third-party pages, so their origin has to
 * be a property of the environment rather than of whichever host the operator's browser
 * happened to reach — and a `Host` / `X-Forwarded-Host` header is caller-supplied, so
 * deriving from it let a spoofed header choose where a recipient's link points.
 */
function deriveEmbedBaseUrl(): string | null {
    const decision = resolvePublicAppOrigin();
    return decision.ok ? decision.origin : null;
}

/** POST /api/admin/forms/packet-links — mint a single-recipient packet public link (first step anchors form_public_links row). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireFormsCapability(ctx, FORMS_SUBMISSIONS);
    if (denied) return denied;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const supabase = createAdminClient();
    // R2: a packet link launched from a record only for a record inside the caller's department/site scope.
    const launch = body.launch_from_entity && typeof body.launch_from_entity === "object" ? (body.launch_from_entity as Record<string, unknown>) : null;
    if (launch) {
        const subject = namedSubject(launch.entity_type, launch.entity_id);
        if (!subject || !(await formsSubjectInActorScope(supabase, ctx.orgId, await formsReadScope(), subject))) return jsonError("Not found", 404);
    }
    // R2: the caller's metadata and enrollment selection name destinations too — a metadata `source_entity_*` becomes the
    // prefill source when no launch is given, and the selected child / recipient are minted into the link. Every one of
    // them is checked (children and recipients against the launch opportunity's household roster).
    const launchSubject = launch ? namedSubject(launch.entity_type, launch.entity_id) : null;
    const meta = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? { ...(body.metadata as Record<string, unknown>) } : {};
    const sel = body.enrollment_selection && typeof body.enrollment_selection === "object" && !Array.isArray(body.enrollment_selection)
        ? (body.enrollment_selection as Record<string, unknown>)
        : {};
    const dest = linkMetadataDestination(meta, launchSubject);
    if (typeof sel.customer_member_id === "string") dest.childIds = [...(dest.childIds ?? []), sel.customer_member_id];
    if (typeof sel.recipient_person_id === "string") dest.recipientIds = [...(dest.recipientIds ?? []), sel.recipient_person_id];
    if (!(await formsDestinationInActorScope(supabase, ctx.orgId, await formsReadScope(), dest))) return jsonError("Not found", 404);
    const result = await mintPacketPublicLinkForAdmin({
        supabase,
        orgId: ctx.orgId,
        embedBaseUrl: deriveEmbedBaseUrl(),
        body,
    });

    if (!result.ok) {
        if (result.status === 500) return NextResponse.json({ error: result.message }, { status: 500 });
        if (result.code) return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
        return jsonError(result.message, result.status);
    }
    return jsonData(result.data, { status: 201 });
}
