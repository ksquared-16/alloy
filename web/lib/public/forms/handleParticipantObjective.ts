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

import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import {
    recomputeParticipantObjectiveFromContext,
    resolveParticipantEnrollmentObjectiveWithContext,
} from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { startParticipantTiming } from "@/lib/perf/participantServerTiming";
import { resolveParticipantCanonicalContext } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import { readPendingClarification } from "@/lib/enrollment/participantRuntime/pendingClarification";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParticipantEnrollmentAccess } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";

/**
 * The current objective — what Alloy still needs — for whatever client is executing it.
 *
 * Moved out of the route unchanged, for the same reason as the turn handler: preview must resolve
 * the objective the way production does, or the first thing an administrator sees is already a
 * divergence. One copy, two callers.
 */

export async function handleParticipantObjective(
    supabase: SupabaseClient,
    access: ParticipantEnrollmentAccess,
    timing: ReturnType<typeof startParticipantTiming>,
): Promise<Response> {
    // What the organization already holds about this child. Without it every known fact arrives as
    // `missing`, and the participant is asked for information that is on file — which is exactly
    // what live QA hit.
    // Canonical record and objective context are independent reads — one wave. The needs
    // projection DOES depend on canonical values, so the objective is re-assembled purely (zero
    // queries) once both are in hand.
    const parallelStart = timing.now();
    const [canonical, resolved] = await Promise.all([
        // Canonical prefill is resolved from the journey's subject. A packet-anchored session
        // carries its child in the session's CRM snapshot instead, and the participant runtime
        // already applies that at the form layer — so there is nothing to look up here.
        resolveParticipantCanonicalContext(supabase, {
            orgId: access.orgId,
            processInstanceId: access.processInstanceId,
            // A packet launched at a family names its child here; the journey names it on the
            // instance. Either way the parent is greeted by their child's name.
            customerMemberId: participantSubjectFromSession(access.session),
        }),
        resolveParticipantEnrollmentObjectiveWithContext(supabase, {
            orgId: access.orgId,
            processInstanceId: access.processInstanceId,
            // The session row the access check already read — one fewer serial round trip.
            preloadedSession: access.session,
        }),
    ]);
    timing.mark("objective", parallelStart);
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
    // A question raised on a previous turn survives a reload — the parent sees the same ask.
    const pending = readPendingClarification(
        resolved.context.needsContext.session?.metadata,
        objective.value.next_turn.need?.identity.key ?? null,
    );
    const response = publicOk(
        participantObjectiveWireModel(objective.value, {
            subjectDisplayName: canonical.subjectDisplayName,
            pendingClarificationQuestion: pending?.question ?? null,
        }),
    );
    response.headers.set("Server-Timing", timing.header());
    return response;
}
