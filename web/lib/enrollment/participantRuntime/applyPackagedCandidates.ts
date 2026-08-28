/**
 * Several answers from one response — applied one at a time, through the path that already exists.
 *
 * This is the half of packaging where every safety property lives, and it is deliberately boring:
 * for each accepted candidate the platform synthesises the turn that need WOULD have had, and calls
 * `applyParticipantTurnResponse` exactly as it would for a lone answer. Normalization, authored
 * validation, plausibility, conflict detection and canonical/process-scoped persistence are not
 * re-implemented here, and cannot drift from the single-need path, because they are the same code.
 *
 * Sequential on purpose. Each apply recomputes the objective from post-write state and hands it to
 * the next, so the second answer is validated against a world where the first one is already true —
 * which is the only way a conflict check can mean anything within one response.
 *
 * PARTIAL SUCCESS IS THE NORMAL OUTCOME. A refused candidate leaves its need outstanding and stops
 * nothing: the other answers still settle, and the conversation asks only what remains. A response
 * that resolves two of three is a good response.
 *
 * No provider call lives here. This applies candidates; where they came from is the caller's
 * business, and a deterministic caller and a governed one reach it identically.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyParticipantTurnResponse } from "./applyParticipantTurnResponse";
import {
    resolveParticipantEnrollmentObjectiveWithContext,
    type ParticipantEnrollmentObjective,
    type ParticipantObjectiveContext,
} from "./resolveParticipantEnrollmentObjective";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import type { PackagedCandidate } from "./packagedCandidateSet";
import { resolveAuthoredFieldForTurn } from "./resolveAuthoredFieldForTurn";
import { deterministicPrompt } from "./selectNextParticipantTurn";

export interface PackagedApplyOutcome {
    readonly need_key: string;
    /**
     * The platform's verdict for THIS need, taken from the disposition it actually returned.
     *
     *  - `settled`   — a value was confirmed or written.
     *  - `clarify`   — read, doubted, and now a question. Nothing persisted; the need stays open.
     *  - `refused`   — validation rejected it. Nothing persisted; the need stays open.
     *  - `no_change` — the answer could not be read at all.
     */
    readonly result: "settled" | "clarify" | "refused" | "no_change" | "need_not_outstanding";
    readonly detail?: string;
    /** A question the platform raised about this need, when it doubted the value. */
    readonly clarification?: string;
}

export interface PackagedApplyResult {
    readonly outcomes: readonly PackagedApplyOutcome[];
    /** The objective after every accepted candidate was applied. */
    readonly objective: ParticipantEnrollmentObjective;
    /** Unchanged: the apply layer recomputes the objective, not the context it was resolved from. */
    readonly context: ParticipantObjectiveContext;
}

/** The turn this need would have had, so the existing apply path sees exactly what it expects. */
function turnForNeed(need: EnrollmentInformationNeed): ParticipantEnrollmentObjective["next_turn"] {
    const confirming = need.state === "known_requires_confirmation";
    return {
        kind: confirming ? "confirm_known_value" : "collect_missing_value",
        need,
        prompt: deterministicPrompt(need),
        proposed_value: confirming ? need.current_value : null,
        resolves_occurrences: need.occurrence_count,
    };
}

export async function applyPackagedCandidates(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        processInstanceId: string;
        accepted: readonly PackagedCandidate[];
        current: { objective: ParticipantEnrollmentObjective; context: ParticipantObjectiveContext };
        canonicalValues?: Readonly<Record<string, unknown>>;
        nowIso: string;
        /** True when the parent used an authored control rather than saying it in passing. */
        correctionFlow?: boolean;
    },
): Promise<PackagedApplyResult> {
    const outcomes: PackagedApplyOutcome[] = [];
    let objective = input.current.objective;
    let activeContext = input.current.context;
    let first = true;

    for (const answer of input.accepted) {
        if (!first) {
            // Fresh objective AND fresh context — the session row must reflect the previous write.
            const reread = await resolveParticipantEnrollmentObjectiveWithContext(supabase, {
                orgId: input.orgId,
                processInstanceId: input.processInstanceId,
                ...(input.canonicalValues ? { canonicalValues: input.canonicalValues } : {}),
            });
            if (!reread.ok) break;
            objective = reread.value;
            activeContext = reread.context;
        }
        first = false;

        const need = objective.needs.needs.find((n) => n.identity.key === answer.need_key);
        if (!need || (!need.requires_participant_action && need.state !== "known_requires_confirmation")) {
            // Already settled — by an earlier answer in this same response, or before it. Not an
            // error: the parent told us something we now already know.
            outcomes.push({ need_key: answer.need_key, result: "need_not_outstanding" });
            continue;
        }

        const turn = turnForNeed(need);
        /*
         * EVERY ANSWER AFTER THE FIRST NEEDS A FRESH CONTEXT, AND STILL NEEDS ITS OWN TURN.
         *
         * `current` does two jobs: it spares a re-resolve, and it NAMES the turn being answered.
         * Both matter, and they failed in opposite directions.
         *
         * Reusing the caller's context carries the session row the objective was read from. Correct
         * exactly once: after the first write it is stale, and the read-modify-write over
         * `shared_values` built on it silently drops what the previous answer just saved.
         *
         * Omitting `current` is worse. The apply layer then resolves fresh and answers ITS OWN next
         * turn — so the second answer of a package lands on whatever need happened to be next, and a
         * parent's emergency-contact answer is written into an unrelated question. That is not lost
         * data, it is wrong data, and it is silent.
         *
         * So each answer resolves the objective and context fresh, and stages its own turn onto them.
         */
        const staged: ParticipantEnrollmentObjective = { ...objective, next_turn: turn };
        const applied = await applyParticipantTurnResponse(supabase, {
            orgId: input.orgId,
            processInstanceId: input.processInstanceId,
            candidate: answer.candidate,
            field: resolveAuthoredFieldForTurn(turn, activeContext.needsContext),
            correctionFlow: input.correctionFlow === true,
            ...(input.canonicalValues ? { canonicalValues: input.canonicalValues } : {}),
            nowIso: input.nowIso,
            current: { objective: staged, context: activeContext },
        });

        if (!applied.ok) {
            outcomes.push({ need_key: answer.need_key, result: "refused", detail: applied.refusal.code });
            continue;
        }

        /*
         * The disposition is the platform's verdict, and it is read from the shape the apply layer
         * actually returns — flat, beside the recomputed objective. Reading a nested shape that does
         * not exist made every outcome look `settled` while nothing had been written, which is the
         * most dangerous possible way to be wrong: a caller would tell the parent their answers were
         * saved and then ask for them again.
         */
        const d = applied.disposition;
        switch (d.action) {
            case "confirm_value":
            case "write_shared_value":
                outcomes.push({ need_key: answer.need_key, result: "settled" });
                break;
            case "clarify":
                outcomes.push({ need_key: answer.need_key, result: "clarify", clarification: d.question });
                break;
            case "refused":
                outcomes.push({ need_key: answer.need_key, result: "refused", detail: d.reason });
                break;
            /*
             * The parent used the optional way out. The need is settled with NO value, which is a
             * different outcome from "the runtime could not read the answer" — and listing it here
             * rather than letting it fall through is what makes that difference visible to a caller.
             */
            case "decline_value":
                outcomes.push({ need_key: answer.need_key, result: "settled" });
                break;
            default:
                outcomes.push({ need_key: answer.need_key, result: "no_change", detail: d.reason });
        }

        // The recomputed objective carries forward too, so a caller reading the result sees the
        // world after every answer; the next iteration re-reads context alongside it.
        objective = applied.objective;
    }

    return { outcomes, objective, context: activeContext };
}
