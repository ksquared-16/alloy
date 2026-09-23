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

import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import {
    recomputeParticipantObjectiveFromContext,
    resolveParticipantEnrollmentObjectiveWithContext,
} from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { resolveParticipantCanonicalContext } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";
import { applyParticipantTurnResponse } from "@/lib/enrollment/participantRuntime/applyParticipantTurnResponse";
import {
    applyPartyCollectionResponse,
    parsePartyCollectionResponse,
} from "@/lib/enrollment/participantRuntime/applyPartyCollectionResponse";
import { knownPartyEntriesFromParties } from "@/lib/enrollment/informationNeeds/participantPartyCollection";
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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParticipantEnrollmentAccess } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";

/**
 * ONE participant turn, for whatever client is executing it.
 *
 * ## Why this moved out of the route
 *
 * This is the whole conversational turn — governed interpretation, clarification, confirmation
 * groups, semantic correction, party handling, the authored-field resolution, the write, and the
 * recomputed objective. Preview has to run ALL of it or it is not the runtime, and a preview route
 * that reimplemented any part of it would be a second runtime wearing the first one's name.
 *
 * So nothing here was rewritten. The route's body was MOVED, unchanged, and both callers now
 * delegate to it: the public route resolves a token and passes the real client; preview passes an
 * ephemeral one. Behaviour cannot drift between them because there is only one copy.
 *
 * The route keeps what is genuinely a route's job — parsing the request, and deciding who is
 * allowed to be here.
 */

export type ParticipantTurnBody = {
    text?: unknown;
    value?: unknown;
    confirm_group?: unknown;
    edit_fact?: unknown;
    party?: unknown;
    party_collection?: unknown;
};

export async function handleParticipantTurn(
    supabase: SupabaseClient,
    access: ParticipantEnrollmentAccess,
    body: ParticipantTurnBody,
    timing: ReturnType<typeof startParticipantTiming>,
): Promise<Response> {

    // The turn is read from the platform, never from the client. A stale tab cannot answer a
    // question the objective has already moved past. Canonical record and objective context are
    // independent reads — one wave; the objective is then re-assembled purely with the canonical
    // values, and the context carries them forward for the post-write recompute.
    const parallelStart = timing.now();
    const [canonical, resolved] = await Promise.all([
        // Journey-shaped prefill. A packet-anchored session carries its child in the session's own
        // CRM snapshot, which the form layer already applies.
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
    const currentContext = { ...resolved.context, canonicalValues: canonical.values };
    const current = {
        ok: true as const,
        value: recomputeParticipantObjectiveFromContext(currentContext, resolved.context.needsContext.session),
        context: currentContext,
    };

    /**
     * A GROUPED CONFIRMATION — one gesture, N independent confirmations.
     *
     * The browser sends an intent and nothing else. Which facts the card held is re-derived here
     * from the objective the platform just resolved, so a stale or tampered tab can only ever settle
     * the card the platform is currently showing, and each member still crosses the same validator
     * and records its own D-99 evidence.
     */
    if (body.confirm_group === true) {
        const settled = await applyConfirmationGroup(supabase, {
            orgId: access.orgId,
            sessionId: access.sessionId,
            nowIso: new Date().toISOString(),
            current: { objective: current.value, context: current.context },
        });
        if (!settled.ok) return publicErr(settled.refusal.detail, 409, { code: settled.refusal.code });
        const groupResponse = publicOk({
            outcome: settled.confirmed.length > 0 ? "confirm_value" : "no_change",
            // How many semantic facts this one gesture settled — the ask-once ratio of a group,
            // reported honestly, including when some members did not settle.
            confirmed_count: settled.confirmed.length,
            skipped_count: settled.skipped.length,
            objective: participantObjectiveWireModel(settled.objective, {
                subjectDisplayName: canonical.subjectDisplayName,
            }),
        });
        groupResponse.headers.set("Server-Timing", timing.header());
        return groupResponse;
    }

    /**
     * ONE fact of a group, corrected in place.
     *
     * `ref` is the opaque handle the card issued. It is matched against the group currently being
     * offered — never used to look a need up directly — so the request cannot reach a fact the
     * parent was not just shown, and it cannot name a canonical key or a field id at all.
     */
    const editFact = body.edit_fact;
    if (editFact != null && typeof editFact === "object" && !Array.isArray(editFact)) {
        const ref = String((editFact as { ref?: unknown }).ref ?? "").trim();
        if (!ref) return publicErr("ref is required", 400);
        const edited = await applyConfirmationGroupMemberEdit(supabase, {
            orgId: access.orgId,
            sessionId: access.sessionId,
            ref,
            value: (editFact as { value?: unknown }).value,
            nowIso: new Date().toISOString(),
            current: { objective: current.value, context: current.context },
        });
        if (!edited.ok) {
            return publicErr(edited.refusal.detail, 409, { code: edited.refusal.code });
        }
        const editResponse = publicOk({
            outcome: "write_shared_value",
            objective: participantObjectiveWireModel(edited.objective, {
                subjectDisplayName: canonical.subjectDisplayName,
            }),
        });
        editResponse.headers.set("Server-Timing", timing.header());
        return editResponse;
    }

    /**
     * ADDING A PERSON — decline, reuse, or collect.
     *
     * The browser sends an intent; the ROLE comes from the turn the platform is offering, and a
     * reused person is addressed by a handle matched against the candidates the server published.
     * Everything durable is written through the canonical relationship service.
     */
    /*
     * ONE PERSON IN A COLLECTION — added, corrected or taken off this form.
     *
     * Writes only the conversation's own answer store. Nothing canonical moves here; a Person, a
     * Child and a relationship are still written once, by the canonical relationship command,
     * behind the operator-reviewed Processing commit.
     */
    const collectionBody = parsePartyCollectionResponse(body.party_collection);
    if (collectionBody) {
        const formDefinitionId = current.context.needsContext.forms[0]?.form_definition_id ?? null;
        if (!formDefinitionId) return publicErr("No form is active for this session", 409);
        const known = knownPartyEntriesFromParties(
            current.context.needsContext.forms[0]!.schema,
            (current.context.parties ?? []) as never,
        )[collectionBody.group_field_id];
        const applied = await applyPartyCollectionResponse(supabase, {
            orgId: access.orgId,
            sessionId: access.sessionId,
            formDefinitionId,
            response: collectionBody,
            knownEntries: known ?? [],
        });
        if (!applied.ok) return publicErr(applied.error, 409, { code: "party_collection_refused" });

        /*
         * Re-resolve against the session AS IT NOW IS.
         *
         * A packet-anchored objective is resolved from a session the caller supplies, and the row
         * this request read is already one write out of date. Passing it back unchanged redrew the
         * collection without the person just added — the parent clicks Add, the card refreshes, and
         * nothing appears to have happened.
         */
        const after = await resolveParticipantEnrollmentObjectiveWithContext(supabase, {
            orgId: access.orgId,
            processInstanceId: access.processInstanceId,
            canonicalValues: canonical.values,
            preloadedSession: { ...access.session, shared_values: applied.sharedValues } as typeof access.session,
        });
        if (!after.ok) return publicErr(after.refusal.detail, 409, { code: after.refusal.code });
        const collectionResponse = publicOk({
            outcome: { action: applied.outcome, instance_key: applied.instance_key },
            objective: participantObjectiveWireModel(after.value, {
                subjectDisplayName: canonical.subjectDisplayName,
            }),
        });
        collectionResponse.headers.set("Server-Timing", timing.header());
        return collectionResponse;
    }

    const partyBody = body.party;
    if (partyBody != null && typeof partyBody === "object" && !Array.isArray(partyBody)) {
        const applied = await applyPartyResponse(supabase, {
            orgId: access.orgId,
            sessionId: access.sessionId,
            customerId: current.context.customerId ?? null,
            customerMemberId: current.context.needsContext.subjectId ?? null,
            objective: current.value,
            sessionMetadata: current.context.needsContext.session?.metadata ?? {},
            response: partyBody as never,
            nowIso: new Date().toISOString(),
        });
        if (!applied.ok) return publicErr(applied.error, 409, { code: "party_refused" });

        // Re-resolve: the canonical graph moved, so the platform decides what comes next.
        const after = await resolveParticipantEnrollmentObjectiveWithContext(supabase, {
            orgId: access.orgId,
            processInstanceId: access.processInstanceId,
            canonicalValues: canonical.values,
            preloadedSession: access.session,
        });
        if (!after.ok) return publicErr(after.refusal.detail, 409, { code: after.refusal.code });
        const partyResponse = publicOk({
            outcome: applied.outcome,
            objective: participantObjectiveWireModel(after.value, {
                subjectDisplayName: canonical.subjectDisplayName,
            }),
        });
        partyResponse.headers.set("Server-Timing", timing.header());
        return partyResponse;
    }

    const text = typeof body.text === "string" ? body.text : null;

    /*
     * "LEAVE IT BLANK" IS AN ACTION, NOT A VALUE.
     *
     * The browser sends the intent — a flag, never words — and the server decides whether this turn
     * may be declined at all. Nothing about the shortcut's label crosses the wire as an answer,
     * which is the whole point: its text belongs on the button, not in a middle-name box.
     */
    const declined = (body as { decline?: unknown }).decline === true;

    // Deterministic FIRST. A value typed into the control, or an unambiguous "yes", needs no model
    // and must never wait on one.
    let candidate: StructuredCandidate = declined
        ? { kind: "declined" }
        : interpretParticipantResponseDeterministically({
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
            org_id: access.orgId,
            turn: current.value.next_turn,
            response_text: text,
            field: null,
            correlation_id: `participant-turn:${access.sessionId}`,
            // The participant acts through a public link, so there is no operator identity to name
            // and none is invented. `system` with a null actor id is the honest description.
            initiating_actor: { actor_type: "system", actor_id: null },
            channel: "participant",
            provider_reasoning_permitted: await participantProviderReasoningPermitted(
                supabase,
                access.orgId,
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
        orgId: access.orgId,
        processInstanceId: access.processInstanceId,
        session: access.session,
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
        /*
         * THE PARENT ASKED SOMETHING.
         *
         * Answered from the objective this turn already resolved — the same numbers driving the
         * screen — and carried on the existing presentation channel, so the answer appears as
         * Alloy's next line while the SAME deterministic turn and controls stand. Nothing was
         * written; see the write boundary in applyParticipantTurnResponse.
         */
        ...(applied.disposition.action === "answer_question"
            ? {
                  clarification: answerParticipantQuestion({
                      question: applied.disposition.question,
                      objective: applied.objective,
                      subjectDisplayName: canonical.subjectDisplayName,
                      /*
                       * What Alloy actually holds, named the way the parent will recognise it.
                       *
                       * Derived from the objective's own settled needs rather than a second lookup,
                       * so "what do you already have" and the ticks on screen cannot disagree. Live
                       * QA caught the alternative: with nothing passed, the answer claimed nothing
                       * was on file for a child whose name and date of birth were already prefilled.
                       */
                      knownLabels: (applied.objective.needs?.needs ?? [])
                          /*
                           * The three states that mean Alloy HOLDS this fact: it came off the
                           * record (`known`), it came off the record and wants checking
                           * (`known_requires_confirmation`), or the parent has since confirmed it
                           * (`confirmed`). `missing` is what we are asking for and `declined` is a
                           * settled blank — neither is something we have.
                           */
                          .filter(
                              (n) =>
                                  n.state === "known"
                                  || n.state === "known_requires_confirmation"
                                  || n.state === "confirmed",
                          )
                          .map((n) => (n.occurrences?.[0]?.label ?? "").trim())
                          .filter(Boolean),
                  }).text,
              }
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
