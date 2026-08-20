/**
 * Apply one participant response, then ALWAYS recompute the objective (Phase 3).
 *
 * The full turn cycle, with the platform holding every decision:
 *
 * ```
 *   deterministic turn  ->  interpretation (deterministic, or provider-assisted)
 *     ->  StructuredCandidate      (the only shape a provider may return)
 *     ->  deterministic validation (a model's output is not truth)
 *     ->  existing command path    (D-99 confirmation, or the shared-value write)
 *     ->  RECOMPUTE the objective  (the platform decides what changed)
 * ```
 *
 * ## Recomputation is not optional
 *
 * Whether the need disappeared, whether another remains, whether Form prefill changed, whether a
 * Form became ready for review, whether Enrollment is complete — all of that is decided by
 * re-deriving the deterministic objective, never by the conversation layer asserting it. That is
 * what stops a chat turn from ever becoming a lifecycle authority.
 *
 * ## No conversation memory
 *
 * Durable state is the process, the session, its shared values, the D-99 confirmation evidence, the
 * Forms and submissions, and the deterministic progress. This function writes to exactly two of
 * those — through the paths that already own them — and reads everything else fresh.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { shallowMergeSharedValues } from "@/lib/forms/packets/formPacketService";
import { buildEnrollmentNeedConfirmationPatch } from "@/lib/enrollment/informationNeeds/enrollmentSessionConfirmations";
import { disposeParticipantCandidate } from "@/lib/enrollment/participantRuntime/validateParticipantCandidate";
import {
    recomputeParticipantObjectiveFromContext,
    resolveParticipantEnrollmentObjective,
    type ParticipantEnrollmentObjective,
    type ParticipantObjectiveContext,
} from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import type { FormField } from "@/lib/forms/schema";
import type {
    CandidateDisposition,
    StructuredCandidate,
} from "@/lib/enrollment/participantRuntime/participantTurnTypes";

export type ApplyTurnResult =
    | {
          readonly ok: true;
          readonly disposition: CandidateDisposition;
          /** The objective AFTER recomputation. The platform's verdict on what changed. */
          readonly objective: ParticipantEnrollmentObjective;
      }
    | { readonly ok: false; readonly refusal: { readonly code: string; readonly detail: string } };

/**
 * Apply a candidate to the CURRENT turn of the objective.
 *
 * The objective is resolved fresh rather than trusted from the client: a turn the participant is
 * answering must be the turn the platform currently believes is next, or a stale tab could confirm a
 * value that has since changed.
 */
export async function applyParticipantTurnResponse(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        processInstanceId: string;
        candidate: StructuredCandidate;
        /** The authored control for the current need, for type validation. */
        field?: FormField | null;
        /** Injected so the write stays deterministic and testable. */
        nowIso: string;
        canonicalValues?: Readonly<Record<string, unknown>>;
        /**
         * The objective the CALLER already resolved this request, with its context.
         *
         * The route resolves the current turn to interpret the participant's words; resolving it
         * again here was a full duplicate (~8 serial query waves), and the post-write recompute was
         * a third. With the context, this function fetches nothing it already knows and recomputes
         * the objective PURELY from post-write state. Omit it and the historical behavior stands —
         * resolve fresh, recompute fresh.
         */
        current?: {
            readonly objective: ParticipantEnrollmentObjective;
            readonly context: ParticipantObjectiveContext;
        };
    },
): Promise<ApplyTurnResult> {
    const before = input.current
        ? ({ ok: true, value: input.current.objective } as const)
        : await resolveParticipantEnrollmentObjective(supabase, {
        orgId: input.orgId,
        processInstanceId: input.processInstanceId,
        canonicalValues: input.canonicalValues,
    });
    if (!before.ok) return before;

    const turn = before.value.next_turn;
    const disposition = disposeParticipantCandidate({
        turn,
        candidate: input.candidate,
        field: input.field ?? null,
    });

    const sessionId = before.value.session_id;
    const needKey = turn.need?.identity.key ?? null;
    const sharedKey = turn.need?.identity.shared_value_key ?? null;
    /** The session as it stands AFTER this turn's write — the pure recompute's one moving input. */
    let postWrite: { shared_values: Record<string, unknown>; metadata: Record<string, unknown> } | null = null;

    if (sessionId && needKey && disposition.action !== "no_change" && disposition.action !== "refused") {
        const { data: sessionRow, error: readError } = await supabase
            .from("form_packet_sessions")
            .select("shared_values, metadata")
            .eq("id", sessionId)
            .eq("org_id", input.orgId)
            .maybeSingle();
        if (readError) {
            return { ok: false, refusal: { code: "read_failed", detail: readError.message } };
        }
        const row = (sessionRow ?? {}) as {
            shared_values?: Record<string, unknown> | null;
            metadata?: Record<string, unknown> | null;
        };
        postWrite = {
            shared_values: (row.shared_values ?? {}) as Record<string, unknown>,
            metadata: (row.metadata ?? {}) as Record<string, unknown>,
        };

        if (disposition.action === "confirm_value") {
            // D-99, bound to the exact value. No CANONICAL record is touched — confirming does not
            // rewrite what the organization holds.
            const metadata = buildEnrollmentNeedConfirmationPatch({
                metadata: row.metadata ?? {},
                needKey,
                confirmedValue: disposition.value,
                confirmedAtIso: input.nowIso,
            });

            /**
             * The confirmed value ALSO becomes a session shared value.
             *
             * Confirming used to write evidence and nothing else, so the artifacts never received
             * the fact the parent had just agreed to: the review step rendered an empty date of
             * birth for a child whose date of birth was on file and had been confirmed seconds
             * earlier. The evidence said yes; nothing carried the value.
             *
             * The session's shared namespace is the right home for it. It is not the canonical
             * record — it is this packet's answer of record, which is exactly what the artifacts
             * are filled from, and what "collected or confirmed ONCE and applied everywhere" means.
             */
            const patch: Record<string, unknown> = {};
            if (metadata) patch.metadata = metadata;
            if (sharedKey) {
                patch.shared_values = shallowMergeSharedValues(
                    (row.shared_values ?? {}) as Record<string, unknown>,
                    { [sharedKey]: disposition.value },
                );
            }
            if (Object.keys(patch).length > 0) {
                const { error } = await supabase
                    .from("form_packet_sessions")
                    .update(patch)
                    .eq("id", sessionId)
                    .eq("org_id", input.orgId);
                if (error) return { ok: false, refusal: { code: "write_failed", detail: error.message } };
                postWrite = {
                    shared_values: (patch.shared_values ?? postWrite?.shared_values ?? {}) as Record<string, unknown>,
                    metadata: (patch.metadata ?? postWrite?.metadata ?? {}) as Record<string, unknown>,
                };
            }
        }

        if (disposition.action === "write_shared_value" && sharedKey) {
            // The EXISTING packet shared-value path. One write reaches every occurrence through the
            // settled prefill merge — there is no per-Form fan-out to keep in step.
            const shared_values = shallowMergeSharedValues((row.shared_values ?? {}) as Record<string, unknown>, {
                [sharedKey]: disposition.value,
            });
            /**
             * A participant SUPPLYING a value is the strongest confirmation the platform can get —
             * the same rule the review-edit path follows. Without this evidence, a corrected fact
             * under the D-100 policy recomputed straight back to `known_requires_confirmation`, and
             * the runtime asked the parent to confirm the name they had typed seconds earlier —
             * observed live: "changed to John Peters → is John Peters still right? → asked again".
             * The fingerprint binds to the corrected value, so a LATER change still re-opens it.
             */
            const metadata = buildEnrollmentNeedConfirmationPatch({
                metadata: row.metadata ?? {},
                needKey,
                confirmedValue: disposition.value,
                confirmedAtIso: input.nowIso,
            });
            const patch: Record<string, unknown> = { shared_values };
            if (metadata) patch.metadata = metadata;
            const { error } = await supabase
                .from("form_packet_sessions")
                .update(patch)
                .eq("id", sessionId)
                .eq("org_id", input.orgId);
            if (error) return { ok: false, refusal: { code: "write_failed", detail: error.message } };
            postWrite = {
                shared_values,
                metadata: (patch.metadata ?? postWrite?.metadata ?? {}) as Record<string, unknown>,
            };
        }
    }

    // ALWAYS recompute. The platform, not the conversation, decides what changed. With the
    // caller's context in hand the recompute is PURE: the only input this turn can have moved is
    // the session row, and the writer holds its post-write state. Without the context, the
    // historical fresh resolution stands.
    if (input.current) {
        const baseSession = input.current.context.needsContext.session;
        const session = postWrite && baseSession ? { ...baseSession, ...postWrite } : baseSession;
        return {
            ok: true,
            disposition,
            objective: recomputeParticipantObjectiveFromContext(input.current.context, session),
        };
    }
    const after = await resolveParticipantEnrollmentObjective(supabase, {
        orgId: input.orgId,
        processInstanceId: input.processInstanceId,
        canonicalValues: input.canonicalValues,
    });
    if (!after.ok) return after;

    return { ok: true, disposition, objective: after.value };
}
