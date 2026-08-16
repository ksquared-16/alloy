/**
 * GET /api/public/forms/[token]/enrollment-objective
 *
 * The participant's own view of their Enrollment: what is done, what remains, and the one thing to
 * do next. Hosted on the EXISTING public forms token surface — same route family, same access
 * doctrine, no second participant application.
 *
 * Read only. Opening this never launches a session or writes participant state.
 */

import { NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import { resolveParticipantEnrollmentObjective } from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
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

    const objective = await resolveParticipantEnrollmentObjective(supabase, {
        orgId: access.value.orgId,
        processInstanceId: access.value.processInstanceId,
    });
    if (!objective.ok) return publicErr(objective.refusal.detail, 409, { code: objective.refusal.code });

    // Narrowed for the wire: a participant surface never receives org ids, revision internals or
    // requirement plumbing it has no use for.
    return publicOk(participantObjectiveWireModel(objective.value));
}
