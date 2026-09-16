/**
 * GET /api/admin/forms/packet-definitions/[packetDefId]/packet-preview/objective
 *
 * Starts a preview conversation and returns the participant runtime's own objective — the same
 * shape, from the same resolver, as the public participant route.
 *
 * This route contains NO runtime logic. It authenticates the administrator, builds ephemeral
 * execution state, and delegates to `handleParticipantObjective`, which is the identical function
 * the public route calls. If preview and production ever disagree about what Alloy needs next, it
 * will not be because this file decided something.
 */

import { NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { startParticipantTiming } from "@/lib/perf/participantServerTiming";
import { handleParticipantObjective } from "@/lib/public/forms/handleParticipantObjective";
import { bootstrapPreviewSession } from "@/lib/enrollment/participantPreview/bootstrapPreviewSession";
import { putPreview } from "@/lib/enrollment/participantPreview/previewSessionRegistry";
import { previewAccessFor } from "@/lib/enrollment/participantPreview/previewAccess";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ packetDefId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { packetDefId: raw } = await params;
    const packetDefId = parseUuidParam(raw, "packetDefId");
    if (packetDefId instanceof NextResponse) return packetDefId;

    const real = createServiceRoleClient();
    const boot = await bootstrapPreviewSession(real, { orgId: ctx.orgId, packetDefinitionId: packetDefId });
    if (!boot.ok) {
        return NextResponse.json({ ok: false, error: boot.error.message, code: boot.error.code }, { status: 409 });
    }

    putPreview(boot.value.session.id, boot.value, ctx.orgId);

    const res = await handleParticipantObjective(
        boot.value.db,
        previewAccessFor(boot.value),
        startParticipantTiming(),
    );
    // The preview id is how the next turn finds this conversation; it is a memory key, not a token.
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ ...body, preview_id: boot.value.session.id }, { status: res.status });
}
