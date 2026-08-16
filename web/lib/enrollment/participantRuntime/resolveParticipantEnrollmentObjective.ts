/**
 * The canonical Participant Enrollment Objective — one runtime read model (Phase 3).
 *
 * A COMPOSITION of the deterministic projections from Slices 2.1-2.4, not a new authority and not a
 * new table. Every fact in it is already owned somewhere:
 *
 * ```
 *   process instance + pinned revision + stage + requirement progress   Slice 2.3
 *   unique information needs + D-99 confirmations                       Slice 2.4
 *   next deterministic turn                                             selectNextParticipantTurn
 * ```
 *
 * No durable objective entity is created. The repository gives no evidence one is needed: every
 * component is derivable from the process instance and its anchored session, and a table would
 * immediately become a second thing to keep in step with the projections that already answer.
 *
 * Suitable for three consumers without change: the participant UI, deterministic turn selection, and
 * the construction of a Trust Information Package for provider assistance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveEnrollmentParticipantProgress } from "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress";
import { resolveEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/resolveEnrollmentInformationNeeds";
import { enrollmentConfirmationPolicy } from "@/lib/enrollment/participantRuntime/enrollmentConfirmationPolicy";
import { selectNextParticipantTurn } from "@/lib/enrollment/participantRuntime/selectNextParticipantTurn";
import type { EnrollmentParticipantProgress } from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";
import type {
    EnrollmentInformationNeed,
    EnrollmentInformationNeeds,
} from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";

export type ParticipantEnrollmentObjective = {
    readonly process_instance_id: string;
    readonly session_id: string | null;
    readonly business_process_revision_id: string | null;
    readonly stage_key: string | null;
    readonly progress: EnrollmentParticipantProgress;
    readonly needs: EnrollmentInformationNeeds;
    /** Needs the participant must still confirm. */
    readonly known_requiring_confirmation: readonly EnrollmentInformationNeed[];
    /** Needs with no usable value. */
    readonly missing: readonly EnrollmentInformationNeed[];
    /** Occurrences that cannot collapse into a shared fact — signatures and the like. */
    readonly artifact_specific: readonly EnrollmentInformationNeed[];
    /** The one deterministic answer to "what next?". Never provider-influenced. */
    readonly next_turn: ParticipantTurn;
};

export type ParticipantEnrollmentObjectiveResult =
    | { readonly ok: true; readonly value: ParticipantEnrollmentObjective }
    | { readonly ok: false; readonly refusal: { readonly code: string; readonly detail: string } };

export async function resolveParticipantEnrollmentObjective(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        processInstanceId: string;
        /** Canonical record prefill by shared key, when the caller already holds it. */
        canonicalValues?: Readonly<Record<string, unknown>>;
    },
): Promise<ParticipantEnrollmentObjectiveResult> {
    const [progressResult, needsResult] = await Promise.all([
        resolveEnrollmentParticipantProgress(supabase, {
            orgId: input.orgId,
            processInstanceId: input.processInstanceId,
        }),
        resolveEnrollmentInformationNeeds(supabase, {
            orgId: input.orgId,
            processInstanceId: input.processInstanceId,
            // D-100 supplies the policy; Slice 2.4 deliberately refused to invent one.
            requiresConfirmation: enrollmentConfirmationPolicy(),
            canonicalValues: input.canonicalValues,
        }),
    ]);

    if (!progressResult.ok) return { ok: false, refusal: progressResult.refusal };
    if (!needsResult.ok) return { ok: false, refusal: needsResult.refusal };

    const progress = progressResult.value;
    const needs = needsResult.value;

    return {
        ok: true,
        value: {
            process_instance_id: progress.process_instance_id,
            session_id: needs.session_id,
            business_process_revision_id: progress.business_process_revision_id,
            stage_key: progress.stage_key,
            progress,
            needs,
            known_requiring_confirmation: needs.needs.filter(
                (n) => n.state === "known_requires_confirmation",
            ),
            missing: needs.needs.filter((n) => n.state === "missing"),
            artifact_specific: needs.needs.filter((n) => n.state === "artifact_specific"),
            next_turn: selectNextParticipantTurn({ needs, progress }),
        },
    };
}
