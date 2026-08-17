/**
 * Participant realization for a started Enrollment journey (B1).
 *
 * The composition Start Enrollment performs after it has a process instance. Every step delegates to
 * the module that already owns it — this file owns the ORDER, not any of the decisions:
 *
 * ```
 *   process instance (already created/resumed by the caller)
 *     → resolveProcessInstanceConfiguration   D-96 governing revision
 *     → resolveEffectiveStageKey              B1a declared entry stage
 *     → planRequirementDerivedPacket          requirements_v1, kind:"form"
 *     → ensureRequirementDerivedPacketDefinition
 *     → mintPacketPublicLinkForAdmin          the access token
 *     → launchEnrollmentObjectiveSession      the anchored session
 * ```
 *
 * ## Not a second Start Enrollment
 *
 * `startEnrollmentService` remains the only owner of starting an Enrollment. This module cannot
 * create a process instance and does not know how to; it takes one that exists. It exists as its own
 * file because the composition is long and the ordering constraints below are worth stating once,
 * not because there is a second entry point.
 *
 * ## Two orderings that are not stylistic
 *
 * **The link is minted before the session.** `form_packet_sessions.started_via_public_link_id` is
 * how a participant's token finds their session, and it is 1:1. A session created first would have
 * no link to be found by, and the column is not nullable.
 *
 * **Resume is checked before minting.** A resumed launch must not mint a second token: the second
 * link would have no session (the first link owns it), so its URL would resolve to `NO_SESSION` —
 * an access link that looks valid and opens nothing. So a current session short-circuits ahead of
 * the mint, and the original link is returned instead.
 *
 * The residual race — two simultaneous first launches — is handled where the database handles it:
 * `launchEnrollmentObjectiveSession` re-resolves after a unique violation and returns the winner's
 * session. The loser's freshly minted link is then an orphan: inert, inactive to nobody, and never
 * returned to an operator. That is preferable to weakening the one-current-session index, which is
 * what makes "one participant objective" true at all.
 *
 * ## Why the link is retrievable
 *
 * A plaintext token is generated once and stored only as a hash, so a resumed launch could otherwise
 * return an identity but no usable URL. Rather than inventing token rotation, this reuses the
 * existing retrievable-link doctrine — `share_embed_path` in link metadata, the same key and reader
 * `distributionLinkReuse` established — so repeated Start Enrollment returns the SAME session and the
 * SAME working URL.
 *
 * That is a posture decision worth naming: it makes the participant link re-readable by any operator
 * who can read the link row, where before it was shown once. It grants nothing new — the operator who
 * launched already saw the URL, and the row is admin-scoped — but it is a change in reach, and it is
 * applied HERE rather than inside the shared mint path so no other packet link's posture moves with
 * it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { resolveProcessInstanceConfiguration } from "@/lib/process/resolveProcessInstanceConfiguration";
import { resolveEffectiveStageKey } from "@/lib/lifecycle/processEntryStage";
import { activeLifecycleProcess } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    ensureRequirementDerivedPacketDefinition,
    planRequirementDerivedPacket,
    type RequirementDerivedPacketRefusal,
} from "@/lib/enrollment/participantLaunch/requirementDerivedPacket";
import {
    launchEnrollmentObjectiveSession,
    resolveCurrentEnrollmentSession,
} from "@/lib/pos/packet/enrollmentObjectiveSession";
import { mintPacketPublicLinkForAdmin } from "@/lib/forms/packets/mintPacketPublicLinkForAdmin";
import {
    readShareEmbedPath,
    SHARE_EMBED_PATH_META_KEY,
} from "@/lib/admin/forms/distributionLinkReuse";

export type ParticipantLaunchRefusal =
    | RequirementDerivedPacketRefusal
    /** The journey is not pinned to a revision, so no governing requirements can be read (D-96). */
    | { readonly code: "no_governing_revision"; readonly detail: string }
    /** Neither a persisted stage nor a declared entry stage — nothing to read requirements for. */
    | { readonly code: "no_effective_stage"; readonly detail: string }
    | { readonly code: "link_failed"; readonly detail: string }
    | { readonly code: "session_failed"; readonly detail: string };

export type ParticipantLaunchValue = {
    readonly processInstanceId: string;
    readonly sessionId: string;
    readonly packetDefinitionId: string;
    readonly publicLinkId: string;
    readonly stageKey: string;
    readonly businessProcessRevisionId: string;
    /** The participant URL. Present on create, and on resume when the link is retrievable. */
    readonly participantPath: string | null;
    readonly outcome: "created" | "resumed";
};

export type ParticipantLaunchResult =
    | { readonly ok: true; readonly value: ParticipantLaunchValue }
    | { readonly ok: false; readonly refusal: ParticipantLaunchRefusal };

type InstanceRow = {
    id: string;
    process_key: string | null;
    stage_key: string | null;
    context_type: string | null;
    context_id: string | null;
    subject_id: string | null;
    business_process_revision_id: string | null;
};

export async function launchParticipantEnrollment(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly processInstanceId: string;
        /** CRM continuity when the journey has it. Absent is legitimate — Enrollment needs no Opportunity. */
        readonly customerId?: string | null;
        readonly opportunityId?: string | null;
    },
): Promise<ParticipantLaunchResult> {
    const { orgId, processInstanceId } = input;

    const { data, error } = await supabase
        .from("process_instances")
        .select("id, process_key, stage_key, context_type, context_id, subject_id, business_process_revision_id")
        .eq("org_id", orgId)
        .eq("id", processInstanceId)
        .maybeSingle();
    if (error) return { ok: false, refusal: { code: "read_failed", detail: error.message } };
    if (!data) {
        return { ok: false, refusal: { code: "read_failed", detail: "Process instance not found" } };
    }
    const instance = data as InstanceRow;

    const revisionId = (instance.business_process_revision_id ?? "").trim();
    if (!revisionId) {
        // Not a degraded read — a deliberate refusal. An unpinned journey would have to read LIVE
        // configuration, and a participant packet built from configuration that can change under it
        // is exactly what D-96 exists to prevent.
        return {
            ok: false,
            refusal: {
                code: "no_governing_revision",
                detail:
                    "This journey is not pinned to a published Business Process revision, so there " +
                    "are no governing requirements to realize.",
            },
        };
    }

    const configuration = await resolveProcessInstanceConfiguration({
        supabase,
        orgId,
        processInstance: instance,
    });

    // The process the journey belongs to, read from the pinned payload. `activeLifecycleProcess` is
    // the fallback only for a payload that names no matching key.
    const process =
        configuration.builder?.processes.find((p) => p.key === (instance.process_key ?? ENROLLMENT_PROCESS_KEY)) ??
        activeLifecycleProcess(configuration.builder ?? { version: 1, active_process_id: null, processes: [] });

    const stageKey = resolveEffectiveStageKey({
        persistedStageKey: instance.stage_key,
        process,
    });
    if (!stageKey) {
        return {
            ok: false,
            refusal: {
                code: "no_effective_stage",
                detail:
                    "This journey has not been moved to a stage and its Business Process declares no " +
                    "entry stage, so there is no stage whose requirements could be realized.",
            },
        };
    }

    const plan = planRequirementDerivedPacket({
        builder: configuration.builder,
        processKey: instance.process_key ?? ENROLLMENT_PROCESS_KEY,
        stageKey,
    });

    const packet = await ensureRequirementDerivedPacketDefinition(supabase, {
        orgId,
        revisionId,
        processKey: instance.process_key ?? ENROLLMENT_PROCESS_KEY,
        plan,
    });
    if (!packet.ok) return { ok: false, refusal: packet.refusal };

    // RESUME before mint — see the header. A current session already owns a link.
    const current = await resolveCurrentEnrollmentSession(supabase, { orgId, processInstanceId });
    if (current.error) {
        return { ok: false, refusal: { code: "session_failed", detail: current.error.message } };
    }
    if (current.session) {
        const linkId = String(current.session.started_via_public_link_id ?? "");
        const { data: linkRow } = await supabase
            .from("form_public_links")
            .select("id, metadata")
            .eq("org_id", orgId)
            .eq("id", linkId)
            .maybeSingle();
        return {
            ok: true,
            value: {
                processInstanceId,
                sessionId: String(current.session.id),
                packetDefinitionId: packet.packetDefinitionId,
                publicLinkId: linkId,
                stageKey,
                businessProcessRevisionId: revisionId,
                participantPath: readShareEmbedPath((linkRow as { metadata?: unknown } | null)?.metadata),
                outcome: "resumed",
            },
        };
    }

    const minted = await mintPacketPublicLinkForAdmin({
        supabase,
        orgId,
        embedBaseUrl: null,
        body: {
            packet_definition_id: packet.packetDefinitionId,
            label: `Enrollment — ${stageKey}`,
            metadata: {
                created_via: "enrollment_start",
                derived_from_business_process_revision_id: revisionId,
                stage_key: stageKey,
            },
        },
    });
    if (!minted.ok) return { ok: false, refusal: { code: "link_failed", detail: minted.message } };

    const publicLinkId = String((minted.data as { id?: unknown }).id ?? "");
    const participantPath = String(minted.data.embed_path);

    // Retrievability, applied to THIS link only — see the header.
    await supabase
        .from("form_public_links")
        .update({
            metadata: {
                ...((minted.data as { metadata?: Record<string, unknown> }).metadata ?? {}),
                [SHARE_EMBED_PATH_META_KEY]: participantPath,
            },
        })
        .eq("org_id", orgId)
        .eq("id", publicLinkId);

    const launched = await launchEnrollmentObjectiveSession(supabase, {
        orgId,
        processInstanceId,
        packetDefinitionId: packet.packetDefinitionId,
        linkId: publicLinkId,
        launchFks: {
            person_id: null,
            customer_id: input.customerId ?? null,
            customer_member_id: instance.subject_id ?? null,
            opportunity_id: input.opportunityId ?? null,
        },
    });
    if (!launched.ok) {
        return { ok: false, refusal: { code: "session_failed", detail: launched.refusal.detail } };
    }

    return {
        ok: true,
        value: {
            processInstanceId,
            sessionId: String(launched.value.session.id),
            packetDefinitionId: packet.packetDefinitionId,
            publicLinkId,
            stageKey,
            businessProcessRevisionId: revisionId,
            // A launch that RESUMED behind our resume check raced us; its own link owns the session,
            // so the token we just minted is not the participant's and must not be reported as it.
            participantPath: launched.value.outcome === "created" ? participantPath : null,
            outcome: launched.value.outcome,
        },
    };
}
