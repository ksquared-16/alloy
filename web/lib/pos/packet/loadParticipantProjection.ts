/**
 * Phase 7 — DB adapter for the participant runtime seam + packet completion. Loads a packet session's
 * projection + real submissions, evaluates completion, and returns per-participant views. This is the
 * seam the Conversation Runtime consumes; it does NOT interpret packet schemas (the pure core does).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchEntityType } from "./launchFromEntity";
import { loadPacketProjection } from "./loadPacketProjection";
import { enumerateRequirementsFromForm, type EnumeratedRequirement } from "./requirementResponsibility";
import {
    buildRequirementSubmissions,
    evaluatePacketCompletion,
    projectForParticipant,
    type FormSubmissionFact,
    type PacketCompletion,
    type ParticipantRequirementView,
} from "./packetResponsibilityProjection";

/** Derive the roster anchor from a session's crm_snapshot (opportunity wins, then customer). */
function anchorFromCrmSnapshot(snapshot: Record<string, unknown> | null): { entity_type: LaunchEntityType; entity_id: string } | null {
    const s = snapshot ?? {};
    if (typeof s.opportunity_id === "string" && s.opportunity_id) return { entity_type: "opportunity", entity_id: s.opportunity_id };
    if (typeof s.customer_id === "string" && s.customer_id) return { entity_type: "customer", entity_id: s.customer_id };
    return null;
}

export interface ParticipantProjectionResult {
    ok: boolean;
    error?: string;
    packet_session_id?: string;
    packet_complete?: boolean;
    completion?: PacketCompletion;
    /** Per-participant view for the requested participant. */
    participant_view?: ParticipantRequirementView[];
}

/**
 * Load a packet session, project its responsibilities against the real roster, evaluate completion
 * from the session's actual submissions, and return the projection for one participant.
 */
export async function loadParticipantProjection(
    supabase: SupabaseClient,
    args: { orgId: string; packetSessionId: string; participantPersonId: string }
): Promise<ParticipantProjectionResult> {
    const { orgId, packetSessionId, participantPersonId } = args;

    const { data: session, error: sErr } = await supabase
        .from("form_packet_sessions")
        .select("id, packet_definition_id, status, crm_snapshot")
        .eq("org_id", orgId)
        .eq("id", packetSessionId)
        .maybeSingle();
    if (sErr) return { ok: false, error: sErr.message };
    if (!session) return { ok: false, error: "Packet session not found" };
    const s = session as { id: string; packet_definition_id: string; status: string; crm_snapshot: Record<string, unknown> | null };

    const anchor = anchorFromCrmSnapshot(s.crm_snapshot);
    const proj = await loadPacketProjection(supabase, { orgId, packetDefinitionId: s.packet_definition_id, anchor });
    if (!proj.ok || !proj.projection) return { ok: false, error: proj.error ?? "Failed to project packet" };

    // Enumerated requirements per form (to expand submissions into per-requirement completions).
    const requirementsByForm = new Map<string, EnumeratedRequirement[]>();
    // Rebuild from the projection's requirements (already enumerated + resolved) grouped by form.
    for (const req of proj.projection.requirements) {
        const fid = req.ref.form_definition_id;
        const list = requirementsByForm.get(fid) ?? [];
        list.push(req);
        requirementsByForm.set(fid, list);
    }

    // Real submissions for this session → facts.
    const { data: itemRows, error: iErr } = await supabase
        .from("form_packet_session_items")
        .select("form_submission_id, packet_item_id")
        .eq("org_id", orgId)
        .eq("packet_session_id", packetSessionId);
    if (iErr) return { ok: false, error: iErr.message };
    const submissionIds = ((itemRows ?? []) as Array<{ form_submission_id: string | null }>)
        .map((r) => r.form_submission_id)
        .filter((x): x is string => !!x);

    const facts: FormSubmissionFact[] = [];
    if (submissionIds.length > 0) {
        const { data: subRows, error: subErr } = await supabase
            .from("form_submissions")
            .select("id, form_definition_id, person_id, customer_member_id")
            .eq("org_id", orgId)
            .in("id", submissionIds);
        if (subErr) return { ok: false, error: subErr.message };
        for (const row of (subRows ?? []) as Array<{ form_definition_id: string | null; person_id: string | null; customer_member_id: string | null }>) {
            if (!row.form_definition_id) continue;
            facts.push({
                form_definition_id: row.form_definition_id,
                participant_id: row.person_id,
                child_id: row.customer_member_id,
            });
        }
    }

    const submissions = buildRequirementSubmissions(facts, requirementsByForm);
    const completion = evaluatePacketCompletion(proj.projection.instances, submissions);
    const participant_view = projectForParticipant({ completions: completion.completions, participantId: participantPersonId });

    return {
        ok: true,
        packet_session_id: packetSessionId,
        packet_complete: completion.complete,
        completion,
        participant_view,
    };
}
