/**
 * Participant progress for a packet session that has no Business Process behind it.
 *
 * ## The seam this uses, rather than a second resolver
 *
 * `resolveEnrollmentParticipantProgress` reads as one chain, but it is two responsibilities joined
 * in the middle:
 *
 * ```
 *   process instance → pinned revision → stage → canonicalStageRequirements
 *                                                          │
 *                                          requirements ───┤   ← the seam
 *                                                          │
 *                     realized session items → projectRequirementsProgress → summarize
 * ```
 *
 * Everything above the seam is Business Process: D-96's pinned revision, D-103's entry intent, the
 * stage, the stage's authored requirements. Everything below it is generic participant work: which
 * step realized which form, which submission is complete, how many remain. The lower half never
 * asks where the requirements came from.
 *
 * An independently launched packet has no revision and no stage — but it has the same thing the
 * upper half exists to produce: an ordered list of forms the participant owes. So this module
 * supplies requirements from the packet's own steps and hands them to the identical lower half,
 * sharing `requirementIdForForm` with the Studio packet compiler so one form means one requirement
 * id wherever the translation happens.
 *
 * The result is the SAME `EnrollmentParticipantProgress` shape, which is what lets information
 * needs, the objective and the conversation run unchanged. Nothing downstream learns that a packet
 * session can be its own anchor; it simply stops being told otherwise.
 *
 * Read only, like its process-backed sibling.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { requirementIdForForm } from "@/lib/lifecycle/compilePacketToStageRequirements";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";
import {
    summarizeEnrollmentRequirementProgress,
    type EnrollmentParticipantProgress,
} from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";
import {
    projectRequirementsProgress,
    type RealizedSessionFormItem,
} from "@/lib/enrollment/participantProgress/projectEnrollmentParticipantProgress";
import {
    loadRealizedFormItems,
    type EnrollmentProgressLoaded,
    type EnrollmentParticipantProgressResult,
} from "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress";
import type { PacketSessionRow } from "@/lib/forms/packets/formPacketService";

type SessionItemRow = {
    id: string;
    packet_item_id: string;
    resolved_form_definition_version_id: string | null;
    form_submission_id: string | null;
};

/** The child this session is for, when its launch named one. */
function subjectFromCrmSnapshot(session: PacketSessionRow): string | null {
    const snap = (session as { crm_snapshot?: unknown }).crm_snapshot;
    if (!snap || typeof snap !== "object") return null;
    const id = String((snap as { customer_member_id?: unknown }).customer_member_id ?? "").trim();
    return id || null;
}

/**
 * Progress for a packet-anchored participant session.
 *
 * @param session the session row the token resolver already read — never re-fetched here
 */
export async function resolvePacketParticipantProgress(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        session: PacketSessionRow;
        /** Receives what was loaded, so needs can recompute without re-reading any of it. */
        captureLoaded?: (loaded: EnrollmentProgressLoaded) => void;
    },
): Promise<EnrollmentParticipantProgressResult> {
    const session = input.session;
    const packetDefinitionId = String(
        (session as { packet_definition_id?: unknown }).packet_definition_id ?? "",
    ).trim();
    if (!packetDefinitionId) {
        return { ok: false, refusal: { code: "read_failed", detail: "Session names no packet." } };
    }

    // The packet's authored steps, and what this participant has realized against them.
    const [defItems, sessionItems] = await Promise.all([
        supabase
            .from("form_packet_items")
            .select("form_definition_id, sequence_index")
            .eq("org_id", input.orgId)
            .eq("packet_definition_id", packetDefinitionId)
            .order("sequence_index", { ascending: true }),
        supabase
            .from("form_packet_session_items")
            .select("id, packet_item_id, resolved_form_definition_version_id, form_submission_id")
            .eq("org_id", input.orgId)
            .eq("packet_session_id", session.id)
            .order("sequence_index", { ascending: true }),
    ]);
    if (defItems.error) return { ok: false, refusal: { code: "read_failed", detail: defItems.error.message } };
    if (sessionItems.error) {
        return { ok: false, refusal: { code: "read_failed", detail: sessionItems.error.message } };
    }

    /*
     * The packet's steps ARE this participant's requirements.
     *
     * `requirementIdForForm` is shared with the Studio packet compiler so one form means one
     * requirement id wherever the translation happens — a packet chosen for a stage and the same
     * packet launched by hand describe the same obligation rather than two.
     *
     * The runtime vocabulary is `StageRequirementV1` (a nested `ref` discriminated by kind); the
     * Studio compiler emits the flatter authoring shape that gets persisted into requirements_v1.
     * They are not interchangeable, so this builds the runtime shape rather than casting.
     *
     * One form twice in a packet is one requirement: a duplicate would ask the same family for the
     * same form twice and give the two asks colliding identities.
     */
    const seen = new Set<string>();
    const requirements: readonly StageRequirementV1[] = [
        ...((defItems.data ?? []) as { sequence_index: number; form_definition_id: string }[]),
    ]
        .sort((a, b) => a.sequence_index - b.sequence_index)
        .flatMap((item) => {
            const formDefinitionId = String(item.form_definition_id ?? "").trim();
            if (!formDefinitionId || seen.has(formDefinitionId)) return [];
            seen.add(formDefinitionId);
            return [
                {
                    requirement_id: requirementIdForForm(formDefinitionId),
                    ref: { kind: "form", form_definition_id: formDefinitionId },
                    level: "required",
                    scope: "record",
                    timing: "stage_exit",
                    enforcement: "blocking",
                } satisfies StageRequirementV1,
            ];
        });

    const items = (sessionItems.data ?? []) as SessionItemRow[];
    const realized: RealizedSessionFormItem[] = await loadRealizedFormItems(supabase, input.orgId, items);
    const projected = projectRequirementsProgress(requirements, realized);

    input.captureLoaded?.({
        session: session as EnrollmentProgressLoaded["session"],
        items: items as EnrollmentProgressLoaded["items"],
        formBySessionItem: new Map(realized.map((r) => [r.session_item_id, r.form_definition_id])),
        subjectId: subjectFromCrmSnapshot(session),
    });

    return {
        ok: true,
        value: {
            // No journey. These are the three facts a Business Process would have supplied, and
            // their absence is the honest answer rather than a placeholder.
            process_instance_id: null,
            business_process_revision_id: null,
            stage_key: null,
            session_id: session.id,
            ...summarizeEnrollmentRequirementProgress(projected),
            requirements: projected,
        } satisfies EnrollmentParticipantProgress,
    };
}
