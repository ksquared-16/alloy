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
import type { PacketSessionRow } from "@/lib/forms/packets/formPacketService";

import {
    resolveEnrollmentParticipantProgress,
    type EnrollmentProgressLoaded,
} from "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress";
import {
    assembleEnrollmentInformationNeeds,
    resolveEnrollmentInformationNeeds,
    type EnrollmentInformationNeedsRefusal,
    type EnrollmentNeedsContext,
} from "@/lib/enrollment/informationNeeds/resolveEnrollmentInformationNeeds";
import { enrollmentConfirmationPolicy } from "@/lib/enrollment/participantRuntime/enrollmentConfirmationPolicy";
import { selectNextParticipantTurn } from "@/lib/enrollment/participantRuntime/selectNextParticipantTurn";
import {
    outstandingRequiredEvidence,
    type ParticipantEvidenceObligation,
} from "@/lib/enrollment/participantRuntime/participantEvidenceObligations";
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
    /** Required attachments still owed. Empty once evidence is complete. */
    readonly outstanding_evidence: readonly ParticipantEvidenceObligation[];
};

export type ParticipantEnrollmentObjectiveResult =
    | { readonly ok: true; readonly value: ParticipantEnrollmentObjective }
    | { readonly ok: false; readonly refusal: { readonly code: string; readonly detail: string } };

/** Build the objective from its two projections — PURE, shared by resolve and recompute. */
function buildParticipantObjective(
    progress: EnrollmentParticipantProgress,
    needs: EnrollmentInformationNeeds,
    context?: { readonly forms: EnrollmentNeedsContext["forms"]; readonly evidenceOnFile: ReadonlySet<string> },
): ParticipantEnrollmentObjective {
    /*
     * Evidence is resolved BEFORE the turn is selected, because it is one of the things the turn
     * chooses between. Absent a context the list is empty, which selects exactly as it always did.
     */
    const outstanding_evidence = context
        ? outstandingRequiredEvidence(context.forms, context.evidenceOnFile)
        : [];
    return {
        outstanding_evidence,
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
        next_turn: selectNextParticipantTurn({ needs, progress, outstandingEvidence: outstanding_evidence }),
    };
}

/**
 * Everything a turn's post-write recompute derives from.
 *
 * A participant turn writes ONE thing: the session's shared values / D-99 evidence. The pinned
 * revision, the requirement set, the pinned schemas, the subject and the realized items are all
 * immutable within the request — so the recompute after the write is pure computation over this
 * context plus the post-write session row the writer already holds. The turn used to resolve the
 * full objective three times (~8 serial query waves each); with the context it resolves once.
 */
export type ParticipantObjectiveContext = {
    readonly progress: EnrollmentParticipantProgress;
    readonly needsContext: EnrollmentNeedsContext;
    readonly requiresConfirmation: ReadonlySet<string>;
    readonly canonicalValues?: Readonly<Record<string, unknown>>;
    /**
     * Field ids whose required attachment is already on file for this session.
     *
     * Read from canonical `documents`, NOT from a submission payload — the obligation has to be
     * answerable before any artifact has been prepared, which is the whole point of moving the step
     * ahead of preparation. Immutable within a request, so the post-write recompute reuses it.
     */
    readonly evidenceOnFile?: ReadonlySet<string>;
};

/** Recompute the objective from known post-write state — zero queries, same result shape. */
export function recomputeParticipantObjectiveFromContext(
    context: ParticipantObjectiveContext,
    postWriteSession: EnrollmentNeedsContext["session"],
): ParticipantEnrollmentObjective {
    const needs = assembleEnrollmentInformationNeeds(
        { ...context.needsContext, session: postWriteSession },
        {
            requiresConfirmation: context.requiresConfirmation,
            canonicalValues: context.canonicalValues,
        },
    );
    return buildParticipantObjective(context.progress, needs, {
        forms: context.needsContext.forms,
        evidenceOnFile: context.evidenceOnFile ?? new Set<string>(),
    });
}

export type ParticipantEnrollmentObjectiveWithContextResult =
    | {
          readonly ok: true;
          readonly value: ParticipantEnrollmentObjective;
          readonly context: ParticipantObjectiveContext;
      }
    | { readonly ok: false; readonly refusal: EnrollmentInformationNeedsRefusal };

/** The resolver, also handing back the loaded context for a pure post-write recompute. */
export async function resolveParticipantEnrollmentObjectiveWithContext(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        processInstanceId: string;
        canonicalValues?: Readonly<Record<string, unknown>>;
        /**
         * The session row the token resolver already read.
         *
         * The participant read path used to load this row twice per request — once to prove the
         * link, once to answer "which session is current" — and the second read was a whole serial
         * round trip in front of everything that depends on the session. Handing it forward removes
         * that wave without moving the decision: `resolveCurrentEnrollmentSession` still applies
         * its own predicate and falls back to the query when the row does not satisfy it.
         */
        preloadedSession?: PacketSessionRow | null;
    },
): Promise<ParticipantEnrollmentObjectiveWithContextResult> {
    const requiresConfirmation = enrollmentConfirmationPolicy();
    let loaded: EnrollmentProgressLoaded | undefined;
    const progressResult = await resolveEnrollmentParticipantProgress(supabase, {
        orgId: input.orgId,
        processInstanceId: input.processInstanceId,
        preloadedSession: input.preloadedSession ?? null,
        captureLoaded: (rows) => {
            loaded = rows;
        },
    });
    let captured: EnrollmentNeedsContext | null = null;
    const needsResult = await resolveEnrollmentInformationNeeds(supabase, {
        orgId: input.orgId,
        processInstanceId: input.processInstanceId,
        requiresConfirmation,
        canonicalValues: input.canonicalValues,
        progress: progressResult,
        // The rows progress just loaded — needs re-reads none of them.
        preloaded: loaded,
        captureContext: (ctx) => {
            captured = ctx;
        },
    });
    if (!progressResult.ok) return { ok: false, refusal: progressResult.refusal };
    if (!needsResult.ok) return { ok: false, refusal: needsResult.refusal };
    if (!captured) {
        return { ok: false, refusal: { code: "read_failed", detail: "Needs context was not captured." } };
    }

    const evidenceOnFile = await resolveEvidenceOnFile(supabase, {
        orgId: input.orgId,
        sessionId: (captured as EnrollmentNeedsContext).session?.id ?? null,
    });

    return {
        ok: true,
        value: buildParticipantObjective(progressResult.value, needsResult.value, {
            forms: (captured as EnrollmentNeedsContext).forms,
            evidenceOnFile,
        }),
        context: {
            progress: progressResult.value,
            needsContext: captured,
            requiresConfirmation,
            canonicalValues: input.canonicalValues,
            evidenceOnFile,
        },
    };
}

export async function resolveParticipantEnrollmentObjective(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        processInstanceId: string;
        /** Canonical record prefill by shared key, when the caller already holds it. */
        canonicalValues?: Readonly<Record<string, unknown>>;
        /** The session row the caller already read — see the context variant. */
        preloadedSession?: PacketSessionRow | null;
    },
): Promise<ParticipantEnrollmentObjectiveResult> {
    // One implementation: the context variant IS the resolver; this signature just drops the
    // context for callers that have no write to recompute after.
    const result = await resolveParticipantEnrollmentObjectiveWithContext(supabase, input);
    return result.ok ? { ok: true, value: result.value } : result;
}

/**
 * Which upload obligations already have a canonical Document.
 *
 * Reads `documents` by the association the upload route writes — `metadata.packet_session_id` and
 * `metadata.field_id` — rather than a form submission, because a required attachment must be
 * answerable before any artifact exists to submit. Never throws: a failed read yields an empty set,
 * which asks for the document again. Asking twice is recoverable; preparing paperwork that is
 * waiting on evidence is not.
 */
async function resolveEvidenceOnFile(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly sessionId: string | null },
): Promise<ReadonlySet<string>> {
    if (!input.sessionId) return new Set<string>();
    try {
        const { data } = await supabase
            .from("documents")
            .select("metadata")
            .eq("org_id", input.orgId)
            .contains("metadata", { packet_session_id: input.sessionId });
        const out = new Set<string>();
        for (const row of (data ?? []) as { metadata?: unknown }[]) {
            const meta = row.metadata;
            if (meta == null || typeof meta !== "object" || Array.isArray(meta)) continue;
            const fieldId = String((meta as Record<string, unknown>).field_id ?? "").trim();
            if (fieldId) out.add(fieldId);
        }
        return out;
    } catch {
        return new Set<string>();
    }
}
