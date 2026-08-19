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
import {
    recomputeParticipantObjectiveFromContext,
    resolveParticipantEnrollmentObjectiveWithContext,
} from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { resolveParticipantCanonicalContext } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";
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

    // What the organization already holds about this child. Without it every known fact arrives as
    // `missing`, and the participant is asked for information that is on file — which is exactly
    // what live QA hit.
    // Canonical record and objective context are independent reads — one wave. The needs
    // projection DOES depend on canonical values, so the objective is re-assembled purely (zero
    // queries) once both are in hand.
    const [canonical, resolved] = await Promise.all([
        resolveParticipantCanonicalContext(supabase, {
            orgId: access.value.orgId,
            processInstanceId: access.value.processInstanceId,
        }),
        resolveParticipantEnrollmentObjectiveWithContext(supabase, {
            orgId: access.value.orgId,
            processInstanceId: access.value.processInstanceId,
        }),
    ]);
    if (!resolved.ok) return publicErr(resolved.refusal.detail, 409, { code: resolved.refusal.code });
    const objective = {
        ok: true as const,
        value: recomputeParticipantObjectiveFromContext(
            { ...resolved.context, canonicalValues: canonical.values },
            resolved.context.needsContext.session,
        ),
    };

    // Narrowed for the wire: a participant surface never receives org ids, revision internals or
    // requirement plumbing it has no use for.
    return publicOk(participantObjectiveWireModel(objective.value, { subjectDisplayName: canonical.subjectDisplayName }));
}
