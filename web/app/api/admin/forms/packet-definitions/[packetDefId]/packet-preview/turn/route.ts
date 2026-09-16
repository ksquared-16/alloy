/**
 * POST /api/admin/forms/packet-definitions/[packetDefId]/packet-preview/turn
 *
 * One participant turn, in preview. Delegates to `handleParticipantTurn` — the same function the
 * public participant route calls, moved there so there is exactly one copy of the conversation.
 *
 * Interpretation, clarification, confirmation, correction, party handling, the write and the
 * recomputed objective all happen in that one place. This file's entire job is: is this an
 * administrator, which preview conversation is this, and hand over the ephemeral client.
 */

import { NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { startParticipantTiming } from "@/lib/perf/participantServerTiming";
import { handleParticipantTurn, type ParticipantTurnBody } from "@/lib/public/forms/handleParticipantTurn";
import { getPreview } from "@/lib/enrollment/participantPreview/previewSessionRegistry";
import { previewAccessFor } from "@/lib/enrollment/participantPreview/previewAccess";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: ParticipantTurnBody & { preview_id?: unknown } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        body = {};
    }

    const previewId = typeof body.preview_id === "string" ? body.preview_id : "";
    const boot = previewId ? getPreview(previewId, ctx.orgId) : null;
    if (!boot) {
        /*
         * A preview that has aged out is told plainly to start again. It is never silently
         * re-created: a fresh conversation pretending to be the old one would answer the
         * administrator's next sentence against an empty objective.
         */
        return NextResponse.json(
            { ok: false, error: "This preview has ended. Open Preview experience again to start a new one.", code: "PREVIEW_EXPIRED" },
            { status: 409 },
        );
    }

    return handleParticipantTurn(boot.db, previewAccessFor(boot), body, startParticipantTiming());
}
