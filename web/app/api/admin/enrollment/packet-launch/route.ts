/**
 * REVIEW THE LAUNCH, THEN RUN IT — one command, one execution path.
 *
 * GET answers "what would sending the paperwork do", writing nothing. POST does it, through
 * `startEnrollment` — the same canonical service every other caller uses, which resolves the
 * journey, joins the live episode, plans the requirement-derived packet, mints the link and reports
 * whether it reused an existing one. Nothing about the launch is reimplemented here.
 *
 * ── WHY A GET AND A POST RATHER THAN ONE CALL ──
 *
 * Because the operator has to be able to look before sending. A family receives what this creates,
 * and "click the button and find out" is not a review. The GET is the preview the command surface
 * renders; the POST is the confirmation. They agree because the preview plans with the launch's own
 * planner rather than a second copy of the rules.
 *
 * ── WHAT THE CALLER MAY NOT DECIDE ──
 *
 * The packet. It is DERIVED from the governing revision's requirements, so there is no
 * `packet_definition_id` to accept and no way for a caller to send a family a different set of
 * paperwork than the process configures. The child is named, and everything else — household,
 * recipient, stage, revision, requirement set, link — is resolved server-side from it.
 */

import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { previewParticipantPacketLaunch } from "@/lib/enrollment/participantLaunch/previewParticipantPacketLaunch";
import { startEnrollment } from "@/lib/records/startEnrollmentService";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const customerMemberId = (request.nextUrl.searchParams.get("customer_member_id") ?? "").trim();
    if (!UUID_RE.test(customerMemberId)) {
        return NextResponse.json({ error: "customer_member_id must be a UUID" }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        const preview = await previewParticipantPacketLaunch(supabase, {
            orgId: ctx.orgId,
            customerMemberId,
        });
        if (!preview.ok) {
            // A child with no open journey is an ordinary answer, not a server fault: the operator
            // is told why there is nothing to send rather than shown an error.
            return NextResponse.json({ error: preview.detail, code: preview.code }, { status: 409 });
        }
        return NextResponse.json({ data: preview.value });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "The launch could not be previewed." },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: { customer_member_id?: unknown };
    try {
        body = (await request.json()) as { customer_member_id?: unknown };
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const customerMemberId = String(body.customer_member_id ?? "").trim();
    if (!UUID_RE.test(customerMemberId)) {
        return NextResponse.json({ error: "customer_member_id must be a UUID" }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        /*
         * `startEnrollment` is idempotent by episode: a second confirmation joins the journey that
         * already exists and resumes its packet rather than minting a second one. That is why a
         * retry is safe and why the response says which happened.
         */
        const result = await startEnrollment(supabase, { orgId: ctx.orgId, customerMemberId });
        const launch = result.participantLaunch;
        return NextResponse.json({
            data: {
                processInstanceId: result.processInstanceId,
                customerMemberId: result.customerMemberId,
                customerId: result.customerId,
                opportunityId: result.opportunityId,
                journeyReused: result.reused,
                contextOutcome: result.contextOutcome,
                launch: launch.realized
                    ? {
                          realized: true as const,
                          sessionId: launch.value.sessionId,
                          packetDefinitionId: launch.value.packetDefinitionId,
                          publicLinkId: launch.value.publicLinkId,
                          participantPath: launch.value.participantPath,
                          stageKey: launch.value.stageKey,
                          businessProcessRevisionId: launch.value.businessProcessRevisionId,
                          /** "created" the first time, "resumed" on a retry. Never a second packet. */
                          outcome: launch.value.outcome,
                      }
                    : { realized: false as const, code: launch.code, detail: launch.detail },
            },
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "The enrollment packet could not be sent." },
            { status: 500 },
        );
    }
}
