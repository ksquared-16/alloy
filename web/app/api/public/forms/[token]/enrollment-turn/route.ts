/**
 * POST /api/public/forms/[token]/enrollment-turn
 *
 * The participant answers the current turn. One request, one full cycle:
 *
 *   interpret -> validate -> command -> RECOMPUTE -> next turn
 *
 * ## No provider is required to reach this endpoint
 *
 * Interpretation here is DETERMINISTIC. A participant may answer in the two ways that need no model
 * at all — an unambiguous "yes", or a value typed into the deterministic control for the current
 * need. Provider assistance, when it is wired, produces the same `StructuredCandidate` this endpoint
 * already validates; it does not become a second path to mutation.
 *
 * That ordering is the point: Enrollment completion must never depend on model uptime.
 */

import { NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import { resolveParticipantEnrollmentObjective } from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { applyParticipantTurnResponse } from "@/lib/enrollment/participantRuntime/applyParticipantTurnResponse";
import { interpretParticipantResponseDeterministically } from "@/lib/enrollment/participantRuntime/deterministicCandidateInterpreter";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return publicErr("Server misconfiguration", 500);
    }

    const { token: rawToken } = await params;
    const supabase = createServiceRoleClient();

    const access = await resolveParticipantEnrollmentFromToken(supabase, plaintextToken(rawToken ?? ""));
    if (!access.ok) {
        return publicErr(access.error.message, access.error.code === "INVALID_LINK" ? 404 : 409, {
            code: access.error.code,
        });
    }

    let body: { text?: unknown; value?: unknown } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        body = {};
    }

    // The turn is read from the platform, never from the client. A stale tab cannot answer a
    // question the objective has already moved past.
    const current = await resolveParticipantEnrollmentObjective(supabase, {
        orgId: access.value.orgId,
        processInstanceId: access.value.processInstanceId,
    });
    if (!current.ok) return publicErr(current.refusal.detail, 409, { code: current.refusal.code });

    const candidate = interpretParticipantResponseDeterministically({
        turn: current.value.next_turn,
        text: typeof body.text === "string" ? body.text : null,
        directValue: body.value,
    });

    const applied = await applyParticipantTurnResponse(supabase, {
        orgId: access.value.orgId,
        processInstanceId: access.value.processInstanceId,
        candidate,
        nowIso: new Date().toISOString(),
    });
    if (!applied.ok) return publicErr(applied.refusal.detail, 409, { code: applied.refusal.code });

    return publicOk({
        // A refusal is reported, not hidden: the participant is told plainly and asked again.
        outcome: applied.disposition.action,
        ...(applied.disposition.action === "refused" ? { reason: applied.disposition.reason } : {}),
        objective: participantObjectiveWireModel(applied.objective),
    });
}
