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

import { answerParticipantQuestion } from "@/lib/enrollment/participantRuntime/answerParticipantQuestion";
import { participantSubjectFromSession } from "@/lib/public/forms/participantSubjectFromSession";
import { NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import { handleParticipantTurn } from "@/lib/public/forms/handleParticipantTurn";
import {
    recomputeParticipantObjectiveFromContext,
    resolveParticipantEnrollmentObjectiveWithContext,
} from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { resolveParticipantCanonicalContext } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";
import { applyParticipantTurnResponse } from "@/lib/enrollment/participantRuntime/applyParticipantTurnResponse";
import { interpretParticipantResponseDeterministically } from "@/lib/enrollment/participantRuntime/deterministicCandidateInterpreter";
import type { StructuredCandidate } from "@/lib/enrollment/participantRuntime/participantTurnTypes";
import { interpretParticipantResponseViaTrust } from "@/lib/trust/consumers/participantConversationInterpretation";
import { participantProviderReasoningPermitted } from "@/lib/enrollment/participantRuntime/participantProviderAuthorization";
import { startParticipantTiming } from "@/lib/perf/participantServerTiming";
import { createSupabaseTrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import { readPendingClarification } from "@/lib/enrollment/participantRuntime/pendingClarification";
import { resolveAuthoredFieldForTurn } from "@/lib/enrollment/participantRuntime/resolveAuthoredFieldForTurn";
import {
    applyConfirmationGroup,
    applyConfirmationGroupMemberEdit,
} from "@/lib/enrollment/participantRuntime/applyConfirmationGroup";
import { applyPartyResponse } from "@/lib/enrollment/participantRuntime/applyPartyResponse";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
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


    let body: {
        text?: unknown;
        value?: unknown;
        confirm_group?: unknown;
        edit_fact?: unknown;
        party?: unknown;
        party_collection?: unknown;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        body = {};
    }
    return handleParticipantTurn(supabase, access.value, body, timing);
}
