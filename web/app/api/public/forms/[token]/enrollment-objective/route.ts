/**
 * GET /api/public/forms/[token]/enrollment-objective
 *
 * The participant's own view of their Enrollment: what is done, what remains, and the one thing to
 * do next. Hosted on the EXISTING public forms token surface — same route family, same access
 * doctrine, no second participant application.
 *
 * Read only. Opening this never launches a session or writes participant state.
 */

import { participantSubjectFromSession } from "@/lib/public/forms/participantSubjectFromSession";
import { NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import { handleParticipantObjective } from "@/lib/public/forms/handleParticipantObjective";
import {
    recomputeParticipantObjectiveFromContext,
    resolveParticipantEnrollmentObjectiveWithContext,
} from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { startParticipantTiming } from "@/lib/perf/participantServerTiming";
import { resolveParticipantCanonicalContext } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import { readPendingClarification } from "@/lib/enrollment/participantRuntime/pendingClarification";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    try {
    const timing = startParticipantTiming();
    const tokenStart = timing.now();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return publicErr("Server misconfiguration", 500);
    }

    const { token: rawToken } = await params;
    const supabase = createServiceRoleClient();

    const access = await resolveParticipantEnrollmentFromToken(supabase, plaintextToken(rawToken ?? ""));
    timing.mark("token", tokenStart);
    if (!access.ok) {
        return publicErr(access.error.message, access.error.code === "INVALID_LINK" ? 404 : 409, {
            code: access.error.code,
        });
    }
    return handleParticipantObjective(supabase, access.value, timing);
    } catch (e) {
        /*
         * An unhandled throw here used to reach the participant as a 500 with an EMPTY body, which
         * tells them nothing and tells us nothing either. The detail goes to the server log; the
         * parent gets a sentence they can act on.
         */
        console.error("[enrollment-objective]", e);
        return publicErr("We could not load your progress just now. Please refresh to try again.", 500);
    }
}
