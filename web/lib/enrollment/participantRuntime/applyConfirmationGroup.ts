/**
 * Settle a grouped confirmation — as N INDEPENDENT confirmations, never as one.
 *
 * ## What "Yes, that's right" means
 *
 * The parent agreed to a card. The platform does not therefore hold "the card" as a fact: it holds
 * each semantic need the card displayed, confirmed on its own terms. So this walks the group's
 * members and, for each one separately:
 *
 * ```
 *   is this need STILL awaiting confirmation?   (recomputed state, not the browser's claim)
 *     -> dispose a `confirmed` candidate through the SAME validator a single turn uses
 *     -> record its OWN D-99 fingerprint, over its OWN value
 *     -> write its OWN `shared_values` entry, under its OWN canonical key
 * ```
 *
 * Nothing is merged. There is no group identity, no group evidence, no group value and no group
 * fingerprint — a later reader of this session cannot tell that four confirmations arrived in one
 * gesture, which is the correct outcome, because that is a fact about a button and not about the
 * family.
 *
 * ## Partial settlement is normal, and is the proof
 *
 * A member whose value has become unconfirmable is skipped and stays outstanding while its siblings
 * settle. That is exactly what independence means, and it is asserted as its own test rather than
 * left as a reading of this comment.
 *
 * ## One round trip is transport, not coupling
 *
 * The accepted confirmations are folded into one session patch and written once. That is a
 * statement about the wire, not about the facts: the patch contains N separate entries under N
 * separate need keys with N separate fingerprints, and issuing N updates to the same row would
 * produce the identical stored state more slowly and no more independently.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { shallowMergeSharedValues } from "@/lib/forms/packets/formPacketService";
import { buildEnrollmentNeedConfirmationPatch } from "@/lib/enrollment/informationNeeds/enrollmentSessionConfirmations";
import { disposeParticipantCandidate } from "@/lib/enrollment/participantRuntime/validateParticipantCandidate";
import {
    activeConfirmationGroup,
    resolveDisplayedFactRef,
    type ConfirmationGroup,
} from "@/lib/enrollment/participantRuntime/confirmationGroup";
import { resolveAuthoredFieldForTurn } from "@/lib/enrollment/participantRuntime/resolveAuthoredFieldForTurn";
import {
    recomputeParticipantObjectiveFromContext,
    type ParticipantEnrollmentObjective,
    type ParticipantObjectiveContext,
} from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";
import type { ProgramAgeRange } from "@/lib/programs/programAgeRange";

export type ConfirmationGroupOutcome =
    | {
          readonly ok: true;
          /** Need keys that settled. One entry per independently confirmed semantic fact. */
          readonly confirmed: readonly string[];
          /** Members that could not settle and remain outstanding. Never an error. */
          readonly skipped: readonly string[];
          readonly objective: ParticipantEnrollmentObjective;
      }
    | { readonly ok: false; readonly refusal: { readonly code: string; readonly detail: string } };

/**
 * The synthetic turn for ONE member.
 *
 * A group member is a need the runtime would have selected on its own, one turn later. Composing
 * the same turn shape here means the member reaches the identical validator, with the identical
 * authored field and the identical rules — there is no second, laxer path to a confirmation just
 * because the parent answered several at once.
 */
function turnForMember(need: EnrollmentInformationNeed): ParticipantTurn {
    return {
        kind: "confirm_known_value",
        need,
        prompt: "",
        proposed_value: need.current_value,
        resolves_occurrences: need.occurrence_count,
    };
}

/** The group the platform is CURRENTLY offering — re-derived, never taken from the request. */
export function currentConfirmationGroup(
    objective: ParticipantEnrollmentObjective,
): ConfirmationGroup | null {
    if (objective.next_turn.kind !== "confirm_known_value") return null;
    return activeConfirmationGroup(
        objective.needs.needs,
        objective.next_turn.need?.identity.key ?? null,
    );
}

export async function applyConfirmationGroup(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly sessionId: string;
        readonly nowIso: string;
        readonly ageRange?: ProgramAgeRange | null;
        readonly current: {
            readonly objective: ParticipantEnrollmentObjective;
            readonly context: ParticipantObjectiveContext;
        };
    },
): Promise<ConfirmationGroupOutcome> {
    const group = currentConfirmationGroup(input.current.objective);
    if (!group) {
        // The turn is not a grouped confirmation. Refusing rather than improvising keeps a stale tab
        // from settling a card the platform is no longer showing.
        return { ok: false, refusal: { code: "no_group", detail: "There is no group to confirm." } };
    }

    const session = input.current.context.needsContext.session;
    if (!session) {
        return { ok: false, refusal: { code: "no_session", detail: "Session not found." } };
    }
    const base = session as { shared_values?: Record<string, unknown> | null; metadata?: Record<string, unknown> | null };

    const byKey = new Map(input.current.objective.needs.needs.map((n) => [n.identity.key, n]));
    let metadata: Record<string, unknown> = (base.metadata ?? {}) as Record<string, unknown>;
    let sharedValues: Record<string, unknown> = (base.shared_values ?? {}) as Record<string, unknown>;
    const confirmed: string[] = [];
    const skipped: string[] = [];

    for (const member of group.members) {
        const need = byKey.get(member.need_key);
        /*
         * Re-checked against RECOMPUTED state, not against what the card said.
         *
         * The card was composed from this same objective, so in the ordinary case every member
         * still qualifies. The check is here for the ones that do not: a need already settled, or
         * one whose value moved between render and tap.
         */
        if (!need || need.state !== "known_requires_confirmation") {
            if (need) skipped.push(member.need_key);
            continue;
        }

        const turn = turnForMember(need);
        const disposition = disposeParticipantCandidate({
            turn,
            candidate: { kind: "confirmed" },
            field: resolveAuthoredFieldForTurn(turn, input.current.context.needsContext),
            context: { nowIso: input.nowIso, ageRange: input.ageRange ?? null },
        });
        if (disposition.action !== "confirm_value") {
            // Independent means independent: this one stays outstanding, the rest still settle.
            skipped.push(member.need_key);
            continue;
        }

        // ITS OWN fingerprint, over ITS OWN value, under ITS OWN need key.
        const patched = buildEnrollmentNeedConfirmationPatch({
            metadata,
            needKey: need.identity.key,
            confirmedValue: disposition.value,
            confirmedAtIso: input.nowIso,
        });
        if (!patched) {
            skipped.push(member.need_key);
            continue;
        }
        metadata = patched;

        /*
         * The confirmed value also becomes this session's answer of record — the same rule the
         * single confirm turn follows. Evidence alone would leave the artifacts empty for a fact the
         * parent had just agreed to.
         */
        const sharedKey = need.identity.session_value_key;
        if (sharedKey) {
            sharedValues = shallowMergeSharedValues(sharedValues, { [sharedKey]: disposition.value });
        }
        confirmed.push(need.identity.key);
    }

    if (confirmed.length === 0) {
        // Nothing settled, so nothing is written. The parent is returned to the same card.
        return {
            ok: true,
            confirmed: [],
            skipped,
            objective: input.current.objective,
        };
    }

    const { error } = await supabase
        .from("form_packet_sessions")
        .update({ metadata, shared_values: sharedValues })
        .eq("id", input.sessionId)
        .eq("org_id", input.orgId);
    if (error) return { ok: false, refusal: { code: "write_failed", detail: error.message } };

    return {
        ok: true,
        confirmed,
        skipped,
        objective: recomputeParticipantObjectiveFromContext(input.current.context, {
            ...session,
            shared_values: sharedValues,
            metadata,
        }),
    };
}

/**
 * Correct ONE displayed fact, leaving everything beside it untouched.
 *
 * "Make a change" exposes the individual semantic values, and changing one changes exactly that
 * value and the destinations it is mapped to. The browser names an opaque `ref`; the server matches
 * it against the facts it is currently DISPLAYING and refuses anything else, so a request can only
 * ever reach a fact the parent can actually see.
 *
 * ## A settled answer is still editable
 *
 * The displayed set is the active card AND the settled record. A conversation moving on is not a
 * reason for an answer to become immutable — a parent who realises three questions later that they
 * gave last year's address must be able to fix it without starting again. The write is identical
 * either way; only the row they pressed differs.
 *
 * The write is the ordinary one: validate through the same disposal, merge the value under the
 * need's own canonical key, and record a confirmation of the corrected value — a parent typing a
 * value IS the strongest confirmation the platform can get, and without that evidence the need
 * would immediately re-open and ask about the value they had just supplied.
 *
 * Evidence invalidation needs no step of its own. A D-99 confirmation is bound to a value
 * fingerprint, so the moment this value changes the old confirmation stops matching; writing the
 * new one in the same patch is what keeps a corrected fact settled instead of re-queued. No OTHER
 * fact's evidence is read or rewritten, which is the whole of "invalidate only what was affected".
 */
export async function applyConfirmationGroupMemberEdit(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly sessionId: string;
        readonly ref: string;
        readonly value: unknown;
        readonly nowIso: string;
        readonly ageRange?: ProgramAgeRange | null;
        readonly current: {
            readonly objective: ParticipantEnrollmentObjective;
            readonly context: ParticipantObjectiveContext;
        };
    },
): Promise<
    | {
          readonly ok: true;
          readonly need_key: string;
          readonly objective: ParticipantEnrollmentObjective;
      }
    | { readonly ok: false; readonly refusal: { readonly code: string; readonly detail: string } }
> {
    const need = resolveDisplayedFactRef(
        input.current.objective.needs.needs,
        input.current.objective.next_turn.need?.identity.key ?? null,
        input.ref,
    );
    if (!need) {
        return { ok: false, refusal: { code: "unknown_fact", detail: "That detail is not on screen." } };
    }

    const turn = turnForMember(need);
    const disposition = disposeParticipantCandidate({
        turn,
        candidate: { kind: "corrected_value", value: input.value },
        field: resolveAuthoredFieldForTurn(turn, input.current.context.needsContext),
        context: { nowIso: input.nowIso, ageRange: input.ageRange ?? null },
        // The parent deliberately opened this control. An explicit correction may overwrite a value
        // that materially disagrees with the record — that is what "Make a change" means.
        correctionFlow: true,
    });
    if (disposition.action !== "write_shared_value") {
        const detail =
            disposition.action === "refused"
                ? disposition.reason
                : disposition.action === "clarify"
                  ? disposition.question
                  : "That answer could not be read.";
        return { ok: false, refusal: { code: disposition.action, detail } };
    }

    const sharedKey = need.identity.session_value_key;
    if (!sharedKey) {
        return { ok: false, refusal: { code: "not_shared", detail: "That detail belongs to the document itself." } };
    }

    const session = input.current.context.needsContext.session;
    if (!session) return { ok: false, refusal: { code: "no_session", detail: "Session not found." } };
    const base = session as { shared_values?: Record<string, unknown> | null; metadata?: Record<string, unknown> | null };

    // ONE key. A sibling's entry is not read, not rewritten, and cannot move.
    const shared_values = shallowMergeSharedValues(
        (base.shared_values ?? {}) as Record<string, unknown>,
        { [sharedKey]: disposition.value },
    );
    const patch: Record<string, unknown> = { shared_values };
    const metadata = buildEnrollmentNeedConfirmationPatch({
        metadata: base.metadata ?? {},
        needKey: need.identity.key,
        confirmedValue: disposition.value,
        confirmedAtIso: input.nowIso,
    });
    if (metadata) patch.metadata = metadata;

    const { error } = await supabase
        .from("form_packet_sessions")
        .update(patch)
        .eq("id", input.sessionId)
        .eq("org_id", input.orgId);
    if (error) return { ok: false, refusal: { code: "write_failed", detail: error.message } };

    return {
        ok: true,
        need_key: need.identity.key,
        objective: recomputeParticipantObjectiveFromContext(input.current.context, {
            ...session,
            shared_values,
            metadata: (patch.metadata ?? base.metadata ?? {}) as Record<string, unknown>,
        }),
    };
}
