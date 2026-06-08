import { createAdminClient } from "@/lib/supabaseAdmin";
import { emitEvent } from "@/lib/emitEvent";

export type FormSubmissionRowLike = {
    id: string;
    org_id: string;
    form_definition_id: string;
    form_definition_version_id: string;
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
    created_via_public_link_id: string | null;
};

/** Packet correlation appended to form_* workflow payloads when the submission is tied to a packet step. */
export type PacketWorkflowCorrelation = {
    packet_session_id: string;
    packet_definition_id: string;
    packet_item_id: string;
    packet_session_item_id: string;
    packet_status: string;
    /** Session cursor (`form_packet_sessions.current_sequence_index`) at correlation read time. */
    packet_current_step: number;
    /** 1-based step ordinal for this submission (`sequence_index + 1`). */
    packet_item_order: number;
    is_packet_submission: true;
};

/** Sync base payload — backward compatible with pre–Card A3 consumers. */
export function buildFormSubmissionWorkflowPayloadBase(
    sub: FormSubmissionRowLike,
    extras?: { document_id?: string | null }
): Record<string, unknown> {
    return {
        form_submission_id: sub.id,
        form_definition_id: sub.form_definition_id,
        form_definition_version_id: sub.form_definition_version_id,
        person_id: sub.person_id,
        customer_id: sub.customer_id,
        customer_member_id: sub.customer_member_id,
        opportunity_id: sub.opportunity_id,
        org_id: sub.org_id,
        public_link_id: sub.created_via_public_link_id,
        ...(extras?.document_id ? { document_id: extras.document_id } : {}),
    };
}

export function applyPacketCorrelationToWorkflowPayload(
    base: Record<string, unknown>,
    correlation: PacketWorkflowCorrelation | null
): Record<string, unknown> {
    if (!correlation) return base;
    return { ...base, ...correlation };
}

export async function fetchPacketWorkflowCorrelationForSubmission(
    orgId: string,
    submissionId: string
): Promise<PacketWorkflowCorrelation | null> {
    try {
        const supabase = createAdminClient();
        const { data: item, error: itemErr } = await supabase
            .from("form_packet_session_items")
            .select("id, packet_session_id, packet_item_id, sequence_index")
            .eq("form_submission_id", submissionId)
            .eq("org_id", orgId)
            .maybeSingle();

        if (itemErr || !item) return null;

        const { data: sess, error: sessErr } = await supabase
            .from("form_packet_sessions")
            .select("id, packet_definition_id, status, current_sequence_index")
            .eq("id", item.packet_session_id)
            .eq("org_id", orgId)
            .maybeSingle();

        if (sessErr || !sess) return null;

        return {
            packet_session_id: sess.id,
            packet_definition_id: sess.packet_definition_id,
            packet_item_id: item.packet_item_id,
            packet_session_item_id: item.id,
            packet_status: sess.status,
            packet_current_step: sess.current_sequence_index,
            packet_item_order: item.sequence_index + 1,
            is_packet_submission: true,
        };
    } catch (e) {
        console.warn("[fetchPacketWorkflowCorrelationForSubmission]", e instanceof Error ? e.message : e);
        return null;
    }
}

export async function buildFormSubmissionWorkflowPayload(
    sub: FormSubmissionRowLike,
    extras?: { document_id?: string | null }
): Promise<Record<string, unknown>> {
    const base = buildFormSubmissionWorkflowPayloadBase(sub, extras);
    const correlation = await fetchPacketWorkflowCorrelationForSubmission(sub.org_id, sub.id);
    return applyPacketCorrelationToWorkflowPayload(base, correlation);
}

export async function emitFormSubmittedSafe(sub: FormSubmissionRowLike): Promise<void> {
    try {
        const payload = await buildFormSubmissionWorkflowPayload(sub);
        await emitEvent({
            org_id: sub.org_id,
            event_type: "form_submitted",
            entity_type: "form_submissions",
            entity_id: sub.id,
            payload,
        });
    } catch (e) {
        console.warn("[emitFormSubmittedSafe]", e instanceof Error ? e.message : e);
    }
}

export async function emitFormSignedSafe(sub: FormSubmissionRowLike): Promise<void> {
    try {
        const payload = await buildFormSubmissionWorkflowPayload(sub);
        await emitEvent({
            org_id: sub.org_id,
            event_type: "form_signed",
            entity_type: "form_submissions",
            entity_id: sub.id,
            payload,
        });
    } catch (e) {
        console.warn("[emitFormSignedSafe]", e instanceof Error ? e.message : e);
    }
}

export async function emitFormDocumentGeneratedSafe(sub: FormSubmissionRowLike, documentId: string): Promise<void> {
    try {
        const payload = await buildFormSubmissionWorkflowPayload(sub, { document_id: documentId });
        await emitEvent({
            org_id: sub.org_id,
            event_type: "form_document_generated",
            entity_type: "form_submissions",
            entity_id: sub.id,
            payload,
        });
    } catch (e) {
        console.warn("[emitFormDocumentGeneratedSafe]", e instanceof Error ? e.message : e);
    }
}

/**
 * Idempotent: skips insert if a `form_packet_completed` row already exists for this session (payload containment).
 * Call after `advancePacketSessionAfterSubmit` reports `packet_complete` from the public submit path.
 */
export async function emitFormPacketCompletedSafe(
    orgId: string,
    packetSessionId: string
): Promise<{ error: Error | null }> {
    try {
        const supabase = createAdminClient();

        const { data: existing, error: existErr } = await supabase
            .from("workflow_events")
            .select("id")
            .eq("org_id", orgId)
            .eq("event_type", "form_packet_completed")
            .contains("payload", { packet_session_id: packetSessionId })
            .maybeSingle();

        if (existErr) return { error: new Error(existErr.message) };
        if (existing?.id) return { error: null };

        const { data: session, error: sErr } = await supabase
            .from("form_packet_sessions")
            .select(
                "id, org_id, packet_definition_id, started_via_public_link_id, status, completed_at, crm_snapshot, launch_context, shared_values"
            )
            .eq("id", packetSessionId)
            .eq("org_id", orgId)
            .maybeSingle();

        if (sErr) return { error: new Error(sErr.message) };
        if (!session) return { error: new Error("Packet session not found") };

        const { data: items, error: iErr } = await supabase
            .from("form_packet_session_items")
            .select("id, sequence_index, status, form_submission_id")
            .eq("packet_session_id", packetSessionId)
            .eq("org_id", orgId)
            .order("sequence_index", { ascending: true });

        if (iErr) return { error: new Error(iErr.message) };

        const rows = items ?? [];
        const related_submission_ids = rows
            .map((r: { form_submission_id: string | null }) => r.form_submission_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0);
        const completed_item_count = rows.filter((r: { status: string }) => r.status === "submitted").length;

        const shared = session.shared_values && typeof session.shared_values === "object" && !Array.isArray(session.shared_values)
            ? (session.shared_values as Record<string, unknown>)
            : {};

        const crm =
            session.crm_snapshot && typeof session.crm_snapshot === "object" && !Array.isArray(session.crm_snapshot)
                ? (session.crm_snapshot as Record<string, unknown>)
                : {};
        const launch =
            session.launch_context && typeof session.launch_context === "object" && !Array.isArray(session.launch_context)
                ? (session.launch_context as Record<string, unknown>)
                : {};

        const payload: Record<string, unknown> = {
            org_id: orgId,
            packet_session_id: packetSessionId,
            packet_definition_id: session.packet_definition_id,
            public_link_id: session.started_via_public_link_id ?? null,
            final_status: session.status,
            completed_at: session.completed_at ?? null,
            crm_snapshot: crm,
            launch_context: launch,
            shared_values: shared,
            shared_value_top_level_keys: Object.keys(shared),
            completed_item_count,
            total_item_count: rows.length,
            related_submission_ids,
        };

        await emitEvent({
            org_id: orgId,
            event_type: "form_packet_completed",
            entity_type: "form_packet_sessions",
            entity_id: packetSessionId,
            payload,
        });

        return { error: null };
    } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
    }
}
