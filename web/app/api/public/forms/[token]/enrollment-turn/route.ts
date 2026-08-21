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
import {
    recomputeParticipantObjectiveFromContext,
    resolveParticipantEnrollmentObjectiveWithContext,
} from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { resolveParticipantCanonicalContext } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";
import { applyParticipantTurnResponse } from "@/lib/enrollment/participantRuntime/applyParticipantTurnResponse";
import { interpretParticipantResponseDeterministically } from "@/lib/enrollment/participantRuntime/deterministicCandidateInterpreter";
import { interpretParticipantResponseViaTrust } from "@/lib/trust/consumers/participantConversationInterpretation";
import { participantProviderReasoningPermitted } from "@/lib/enrollment/participantRuntime/participantProviderAuthorization";
import { startParticipantTiming } from "@/lib/perf/participantServerTiming";
import { createSupabaseTrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import { readPendingClarification } from "@/lib/enrollment/participantRuntime/pendingClarification";
import { resolveAuthoredFieldForTurn } from "@/lib/enrollment/participantRuntime/resolveAuthoredFieldForTurn";

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

    let body: { text?: unknown; value?: unknown } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        body = {};
    }

    // The turn is read from the platform, never from the client. A stale tab cannot answer a
    // question the objective has already moved past. Canonical record and objective context are
    // independent reads — one wave; the objective is then re-assembled purely with the canonical
    // values, and the context carries them forward for the post-write recompute.
    const parallelStart = timing.now();
    const [canonical, resolved] = await Promise.all([
        resolveParticipantCanonicalContext(supabase, {
            orgId: access.value.orgId,
            processInstanceId: access.value.processInstanceId,
        }),
        resolveParticipantEnrollmentObjectiveWithContext(supabase, {
            orgId: access.value.orgId,
            processInstanceId: access.value.processInstanceId,
            // The session row the access check already read — one fewer serial round trip.
            preloadedSession: access.value.session,
        }),
    ]);
    timing.mark("objective", parallelStart);
    if (!resolved.ok) return publicErr(resolved.refusal.detail, 409, { code: resolved.refusal.code });
    const currentContext = { ...resolved.context, canonicalValues: canonical.values };
    const current = {
        ok: true as const,
        value: recomputeParticipantObjectiveFromContext(currentContext, resolved.context.needsContext.session),
        context: currentContext,
    };

    const text = typeof body.text === "string" ? body.text : null;

    // Deterministic FIRST. A value typed into the control, or an unambiguous "yes", needs no model
    // and must never wait on one.
    let candidate = interpretParticipantResponseDeterministically({
        turn: current.value.next_turn,
        text,
        directValue: body.value,
    });

    // Governed assistance is ADDITIVE, and only where the deterministic path could not read the
    // answer. Every gate — affirmative permission, D-101 turn eligibility, the Information Package,
    // D-101/D-102 privacy — is enforced inside the consumer, and any failure returns a null
    // candidate so the deterministic result below stands. The participant is never blocked on it.
    //
    // The client supplied WORDS. The turn, the need, the semantic key and the command target are all
    // resolved server-side from the objective — the browser never names the field being answered.
    let clarificationPrompt: string | null = null;
    let providerRan = false;
    const interpretStart = timing.now();
    if (candidate.kind === "clarification_needed" && text) {
        providerRan = true;
        const governed = await interpretParticipantResponseViaTrust({
            org_id: access.value.orgId,
            turn: current.value.next_turn,
            response_text: text,
            field: null,
            correlation_id: `participant-turn:${access.value.sessionId}`,
            // The participant acts through a public link, so there is no operator identity to name
            // and none is invented. `system` with a null actor id is the honest description.
            initiating_actor: { actor_type: "system", actor_id: null },
            channel: "participant",
            provider_reasoning_permitted: await participantProviderReasoningPermitted(
                supabase,
                access.value.orgId,
            ),
            nowIso: new Date().toISOString(),
            repository: createSupabaseTrustRepository(),
        });
        if (governed.candidate) candidate = governed.candidate;
        clarificationPrompt = governed.clarification_prompt;
        if (!governed.candidate && governed.skipped_reason) {
            // Operational evidence for the fallback rate: WHY the provider path was not used.
            // Reason codes and gate names only — never the participant's words.
            console.warn("[participant-turn] governed interpretation skipped:", governed.skipped_reason);
        }
    }
    if (providerRan) timing.mark("interpret", interpretStart);
    timing.provider(providerRan);

    const writeStart = timing.now();
    /**
     * THE AUTHORED FIELD, resolved from the PINNED schema.
     *
     * The route used to pass `field: null`, which meant the participant path never reached Forms'
     * own validator and fell back to a narrow type gate — so an authored `min`, `max` or `pattern`
     * was simply not enforced during the conversation, only later at submission. The need names its
     * occurrence's `form_field_id`, and the needs context already carries the pinned schemas.
     */
    const authoredField = resolveAuthoredFieldForTurn(current.value.next_turn, current.context.needsContext);

    const applied = await applyParticipantTurnResponse(supabase, {
        orgId: access.value.orgId,
        processInstanceId: access.value.processInstanceId,
        candidate,
        field: authoredField,
        /**
         * A `value` came from the authored control the parent deliberately opened; a `text` is
         * something they said in passing. Only the former is an explicit correction, and only an
         * explicit correction may overwrite a value that materially disagrees with the record.
         */
        correctionFlow: body.value !== undefined,
        // The SAME canonical record the turn was selected against. Recomputing the objective after
        // the write without it would flip every still-unanswered known fact back to `missing`, and
        // the participant would be asked next for something they were about to confirm.
        canonicalValues: canonical.values,
        nowIso: new Date().toISOString(),
        // The turn this request already resolved, with its context — the apply layer fetches
        // nothing it already knows and recomputes the objective purely from post-write state.
        current: { objective: current.value, context: current.context },
    });
    timing.mark("write_recompute", writeStart);
    if (!applied.ok) return publicErr(applied.refusal.detail, 409, { code: applied.refusal.code });

    const response = publicOk({
        // A refusal is reported, not hidden: the participant is told plainly and asked again.
        outcome: applied.disposition.action,
        ...(applied.disposition.action === "refused" ? { reason: applied.disposition.reason } : {}),
        // The provider's bounded clarifying question, presentation-only: shown as Alloy's next
        // line while the SAME deterministic turn and controls stand. It is not persisted, not a
        // value, and vanishes on any outcome that actually moved the objective.
        ...(clarificationPrompt && (applied.disposition.action === "no_change" || applied.disposition.action === "refused")
            ? { clarification: clarificationPrompt }
            : {}),
        /**
         * The platform's OWN clarification — deterministic, and never the provider's.
         *
         * Carried as `question` plus the two replies the parent may give. The pending value is
         * deliberately NOT sent: the browser confirms by saying yes, and the server re-derives what
         * yes meant, so a tampered client still cannot name the value being written.
         */
        ...(applied.disposition.action === "clarify"
            ? { needs_clarification: { question: applied.disposition.question } }
            : {}),
        objective: participantObjectiveWireModel(applied.objective, {
            subjectDisplayName: canonical.subjectDisplayName,
            // The question this turn just raised, if any — so the surface asks it immediately.
            pendingClarificationQuestion:
                applied.disposition.action === "clarify" ? applied.disposition.question : null,
        }),
    });
    response.headers.set("Server-Timing", timing.header());
    return response;
}
