import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import { loadParticipantProjection } from "@/lib/pos/packet/loadParticipantProjection";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/pos/packets/sessions/[sessionId]/participant-projection?person_id=<guardian>
 *
 * The Conversation Runtime seam (operator-observable): for a live packet session, what does THIS
 * participant still need to do, what is complete, what another participant owns, and is the packet
 * complete overall. Derives from the single projection seam + the session's real submissions.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { sessionId } = await params;
    if (!UUID_RE.test(sessionId)) return jsonError("Invalid session id", 400);
    const personId = new URL(request.url).searchParams.get("person_id");
    if (!personId || !UUID_RE.test(personId)) return jsonError("person_id is required", 400);

    const supabase = createAdminClient();
    const result = await loadParticipantProjection(supabase, { orgId: ctx.orgId, packetSessionId: sessionId, participantPersonId: personId });
    if (!result.ok) return jsonError(result.error ?? "Failed to project participant", 400);

    return jsonData({
        packet_session_id: result.packet_session_id,
        person_id: personId,
        packet_complete: result.packet_complete ?? false,
        outstanding_required: result.completion?.outstanding_required ?? 0,
        participant_view: result.participant_view ?? [],
        completions: (result.completion?.completions ?? []).map((c) => ({
            ref: c.instance.ref,
            type: c.instance.type,
            label: c.instance.label,
            scope_key: c.instance.scope_key,
            child_id: c.instance.child_id,
            required: c.instance.required,
            complete: c.complete,
            completed_by: c.completed_by,
            outstanding_participants: c.outstanding_participants.map((p) => ({ participant_id: p.participant_id, label: p.label })),
        })),
    });
}
