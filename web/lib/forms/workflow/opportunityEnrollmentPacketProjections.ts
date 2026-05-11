/**
 * Opportunity-anchored CRM projection workflow_events for enrollment packets.
 * Canonical lifecycle remains form_packet_sessions / items / submissions; these rows are visibility only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { emitEvent } from "@/lib/emitEvent";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const OPPORTUNITY_ENROLLMENT_PACKET_CREATED = "opportunity_enrollment_packet_created";
export const OPPORTUNITY_ENROLLMENT_PACKET_OPENED = "opportunity_enrollment_packet_opened";
export const OPPORTUNITY_ENROLLMENT_PACKET_STEP_COMPLETED = "opportunity_enrollment_packet_step_completed";
export const OPPORTUNITY_ENROLLMENT_PACKET_COMPLETED = "opportunity_enrollment_packet_completed";

async function projectionExists(
    supabase: SupabaseClient,
    orgId: string,
    eventType: string,
    opportunityId: string,
    payloadContains: Record<string, unknown>
): Promise<boolean> {
    const { data, error } = await supabase
        .from("workflow_events")
        .select("id")
        .eq("org_id", orgId)
        .eq("event_type", eventType)
        .eq("entity_type", "opportunities")
        .eq("entity_id", opportunityId)
        .contains("payload", payloadContains)
        .maybeSingle();
    if (error) return false;
    return Boolean(data?.id);
}

function parseUuid(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return UUID_RE.test(t) ? t : null;
}

/** Pure: derive opportunity id from persisted session JSON (trusted server-written fields only). */
export function resolveOpportunityIdFromSessionSnapshotFields(crmSnapshot: unknown, launchContext: unknown): string | null {
    const snap =
        crmSnapshot && typeof crmSnapshot === "object" && !Array.isArray(crmSnapshot)
            ? (crmSnapshot as Record<string, unknown>)
            : {};
    const fromSnap = parseUuid(snap.opportunity_id);
    if (fromSnap) return fromSnap;

    const lc =
        launchContext && typeof launchContext === "object" && !Array.isArray(launchContext)
            ? (launchContext as Record<string, unknown>)
            : {};
    const st = typeof lc.source_entity_type === "string" ? lc.source_entity_type.trim().toLowerCase() : "";
    if (st === "opportunity") {
        return parseUuid(lc.source_entity_id);
    }
    return null;
}

/** Trusted opportunity id for a packet session (crm_snapshot wins; else launch_context opportunity source). */
export async function resolveOpportunityIdForPacketSession(
    supabase: SupabaseClient,
    orgId: string,
    packetSessionId: string
): Promise<string | null> {
    const { data, error } = await supabase
        .from("form_packet_sessions")
        .select("crm_snapshot, launch_context")
        .eq("id", packetSessionId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error || !data) return null;
    const row = data as { crm_snapshot?: unknown; launch_context?: unknown };
    return resolveOpportunityIdFromSessionSnapshotFields(row.crm_snapshot, row.launch_context);
}

async function loadPacketDefinitionName(supabase: SupabaseClient, orgId: string, packetDefinitionId: string): Promise<string | null> {
    const { data } = await supabase
        .from("form_packet_definitions")
        .select("name")
        .eq("org_id", orgId)
        .eq("id", packetDefinitionId)
        .maybeSingle();
    const n = (data as { name?: string } | null)?.name;
    return typeof n === "string" && n.trim() ? n.trim() : null;
}

async function loadPersonDisplay(supabase: SupabaseClient, orgId: string, personId: string | null): Promise<string | null> {
    if (!personId) return null;
    const { data } = await supabase
        .from("persons")
        .select("first_name, last_name")
        .eq("org_id", orgId)
        .eq("id", personId)
        .maybeSingle();
    const p = data as { first_name?: string | null; last_name?: string | null } | null;
    if (!p) return null;
    const fn = typeof p.first_name === "string" ? p.first_name.trim() : "";
    const ln = typeof p.last_name === "string" ? p.last_name.trim() : "";
    const full = [fn, ln].filter(Boolean).join(" ");
    return full || null;
}

async function loadMemberDisplay(supabase: SupabaseClient, orgId: string, memberId: string | null): Promise<string | null> {
    if (!memberId) return null;
    const { data } = await supabase
        .from("customer_members")
        .select("first_name, last_name")
        .eq("org_id", orgId)
        .eq("id", memberId)
        .maybeSingle();
    const m = data as { first_name?: string | null; last_name?: string | null } | null;
    if (!m) return null;
    const fn = typeof m.first_name === "string" ? m.first_name.trim() : "";
    const ln = typeof m.last_name === "string" ? m.last_name.trim() : "";
    const full = [fn, ln].filter(Boolean).join(" ");
    return full || null;
}

type Launchish = Record<string, unknown>;

function pickRecipientAndMemberIds(launch: Launchish, snap: Launchish): { recipientPersonId: string | null; memberId: string | null } {
    return {
        recipientPersonId: parseUuid(launch.recipient_person_id) ?? parseUuid(snap.person_id),
        memberId: parseUuid(launch.selected_customer_member_id) ?? parseUuid(snap.customer_member_id),
    };
}

async function buildDisplayEnrichment(
    supabase: SupabaseClient,
    orgId: string,
    packetDefinitionId: string,
    launch: Launchish,
    snap: Launchish
): Promise<{ packet_name: string | null; recipient_display: string | null; child_display: string | null }> {
    const { recipientPersonId, memberId } = pickRecipientAndMemberIds(launch, snap);
    const [packet_name, recipient_display, child_display] = await Promise.all([
        loadPacketDefinitionName(supabase, orgId, packetDefinitionId),
        loadPersonDisplay(supabase, orgId, recipientPersonId),
        loadMemberDisplay(supabase, orgId, memberId),
    ]);
    return { packet_name, recipient_display, child_display };
}

export type EmitOpportunityEnrollmentPacketCreatedInput = {
    orgId: string;
    /** Must already be validated as an opportunity in this org (e.g. assertEntityInOrg). */
    opportunityId: string;
    publicLinkId: string;
    packetDefinitionId: string;
    /** Subset of minted link metadata for operator context only — not used for FK trust. */
    linkMetadata: Record<string, unknown>;
};

export async function emitOpportunityEnrollmentPacketCreatedSafe(
    input: EmitOpportunityEnrollmentPacketCreatedInput
): Promise<{ error: Error | null }> {
    try {
        const supabase = createAdminClient();
        const { orgId, opportunityId, publicLinkId, packetDefinitionId, linkMetadata } = input;
        if (await projectionExists(supabase, orgId, OPPORTUNITY_ENROLLMENT_PACKET_CREATED, opportunityId, { public_link_id: publicLinkId })) {
            return { error: null };
        }

        const snap = { opportunity_id: opportunityId } as Record<string, unknown>;
        const launch =
            linkMetadata && typeof linkMetadata === "object" && !Array.isArray(linkMetadata)
                ? (linkMetadata as Record<string, unknown>)
                : {};
        const { packet_name, recipient_display, child_display } = await buildDisplayEnrichment(
            supabase,
            orgId,
            packetDefinitionId,
            launch,
            snap
        );

        const deliveryIntent = typeof launch.delivery_intent === "string" ? launch.delivery_intent : null;

        await emitEvent({
            org_id: orgId,
            event_type: OPPORTUNITY_ENROLLMENT_PACKET_CREATED,
            entity_type: "opportunities",
            entity_id: opportunityId,
            payload: {
                org_id: orgId,
                opportunity_id: opportunityId,
                public_link_id: publicLinkId,
                packet_definition_id: packetDefinitionId,
                packet_name,
                recipient_display,
                child_display,
                delivery_intent: deliveryIntent,
                launch_surface: typeof launch.launch_surface === "string" ? launch.launch_surface : null,
                summary: packet_name ? `Enrollment packet created: ${packet_name}` : "Enrollment packet created",
            },
        });
        return { error: null };
    } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
    }
}

export async function emitOpportunityEnrollmentPacketOpenedSafe(params: {
    orgId: string;
    packetSessionId: string;
}): Promise<{ error: Error | null }> {
    try {
        const supabase = createAdminClient();
        const { orgId, packetSessionId } = params;
        const opportunityId = await resolveOpportunityIdForPacketSession(supabase, orgId, packetSessionId);
        if (!opportunityId) return { error: null };

        if (await projectionExists(supabase, orgId, OPPORTUNITY_ENROLLMENT_PACKET_OPENED, opportunityId, { packet_session_id: packetSessionId })) {
            return { error: null };
        }

        const { data: sess } = await supabase
            .from("form_packet_sessions")
            .select("packet_definition_id, started_via_public_link_id, launch_context, crm_snapshot")
            .eq("id", packetSessionId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (!sess) return { error: null };
        const row = sess as {
            packet_definition_id: string;
            started_via_public_link_id: string | null;
            launch_context?: unknown;
            crm_snapshot?: unknown;
        };
        const launch =
            row.launch_context && typeof row.launch_context === "object" && !Array.isArray(row.launch_context)
                ? (row.launch_context as Record<string, unknown>)
                : {};
        const snap =
            row.crm_snapshot && typeof row.crm_snapshot === "object" && !Array.isArray(row.crm_snapshot)
                ? (row.crm_snapshot as Record<string, unknown>)
                : {};
        const { packet_name, recipient_display, child_display } = await buildDisplayEnrichment(
            supabase,
            orgId,
            row.packet_definition_id,
            launch,
            snap
        );

        await emitEvent({
            org_id: orgId,
            event_type: OPPORTUNITY_ENROLLMENT_PACKET_OPENED,
            entity_type: "opportunities",
            entity_id: opportunityId,
            payload: {
                org_id: orgId,
                opportunity_id: opportunityId,
                packet_session_id: packetSessionId,
                public_link_id: row.started_via_public_link_id ?? null,
                packet_definition_id: row.packet_definition_id,
                packet_name,
                recipient_display,
                child_display,
                summary: packet_name ? `Enrollment packet started: ${packet_name}` : "Enrollment packet started",
            },
        });
        return { error: null };
    } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
    }
}

export async function emitOpportunityEnrollmentPacketStepCompletedSafe(params: {
    orgId: string;
    packetSessionId: string;
    formSubmissionId: string;
    /** 0-based packet definition sequence_index for this step */
    sequenceIndex: number;
}): Promise<{ error: Error | null }> {
    try {
        const supabase = createAdminClient();
        const { orgId, packetSessionId, formSubmissionId, sequenceIndex } = params;
        const opportunityId = await resolveOpportunityIdForPacketSession(supabase, orgId, packetSessionId);
        if (!opportunityId) return { error: null };

        if (
            await projectionExists(supabase, orgId, OPPORTUNITY_ENROLLMENT_PACKET_STEP_COMPLETED, opportunityId, {
                form_submission_id: formSubmissionId,
            })
        ) {
            return { error: null };
        }

        const { data: sess } = await supabase
            .from("form_packet_sessions")
            .select("packet_definition_id, started_via_public_link_id, launch_context, crm_snapshot")
            .eq("id", packetSessionId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (!sess) return { error: null };
        const row = sess as {
            packet_definition_id: string;
            started_via_public_link_id: string | null;
            launch_context?: unknown;
            crm_snapshot?: unknown;
        };
        const launch =
            row.launch_context && typeof row.launch_context === "object" && !Array.isArray(row.launch_context)
                ? (row.launch_context as Record<string, unknown>)
                : {};
        const snap =
            row.crm_snapshot && typeof row.crm_snapshot === "object" && !Array.isArray(row.crm_snapshot)
                ? (row.crm_snapshot as Record<string, unknown>)
                : {};
        const { packet_name, recipient_display, child_display } = await buildDisplayEnrichment(
            supabase,
            orgId,
            row.packet_definition_id,
            launch,
            snap
        );

        const stepOrdinal = sequenceIndex + 1;
        await emitEvent({
            org_id: orgId,
            event_type: OPPORTUNITY_ENROLLMENT_PACKET_STEP_COMPLETED,
            entity_type: "opportunities",
            entity_id: opportunityId,
            payload: {
                org_id: orgId,
                opportunity_id: opportunityId,
                packet_session_id: packetSessionId,
                form_submission_id: formSubmissionId,
                public_link_id: row.started_via_public_link_id ?? null,
                packet_definition_id: row.packet_definition_id,
                packet_name,
                recipient_display,
                child_display,
                sequence_index: sequenceIndex,
                step_ordinal: stepOrdinal,
                summary: packet_name ? `Step ${stepOrdinal} completed — ${packet_name}` : `Step ${stepOrdinal} completed`,
            },
        });
        return { error: null };
    } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
    }
}

export async function emitOpportunityEnrollmentPacketCompletedProjectionSafe(params: {
    orgId: string;
    packetSessionId: string;
}): Promise<{ error: Error | null }> {
    try {
        const supabase = createAdminClient();
        const { orgId, packetSessionId } = params;
        const opportunityId = await resolveOpportunityIdForPacketSession(supabase, orgId, packetSessionId);
        if (!opportunityId) return { error: null };

        if (
            await projectionExists(supabase, orgId, OPPORTUNITY_ENROLLMENT_PACKET_COMPLETED, opportunityId, {
                packet_session_id: packetSessionId,
            })
        ) {
            return { error: null };
        }

        const { data: sess } = await supabase
            .from("form_packet_sessions")
            .select("packet_definition_id, started_via_public_link_id, launch_context, crm_snapshot, completed_at")
            .eq("id", packetSessionId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (!sess) return { error: null };
        const row = sess as {
            packet_definition_id: string;
            started_via_public_link_id: string | null;
            completed_at?: string | null;
            launch_context?: unknown;
            crm_snapshot?: unknown;
        };
        const launch =
            row.launch_context && typeof row.launch_context === "object" && !Array.isArray(row.launch_context)
                ? (row.launch_context as Record<string, unknown>)
                : {};
        const snap =
            row.crm_snapshot && typeof row.crm_snapshot === "object" && !Array.isArray(row.crm_snapshot)
                ? (row.crm_snapshot as Record<string, unknown>)
                : {};
        const { packet_name, recipient_display, child_display } = await buildDisplayEnrichment(
            supabase,
            orgId,
            row.packet_definition_id,
            launch,
            snap
        );

        await emitEvent({
            org_id: orgId,
            event_type: OPPORTUNITY_ENROLLMENT_PACKET_COMPLETED,
            entity_type: "opportunities",
            entity_id: opportunityId,
            payload: {
                org_id: orgId,
                opportunity_id: opportunityId,
                packet_session_id: packetSessionId,
                public_link_id: row.started_via_public_link_id ?? null,
                packet_definition_id: row.packet_definition_id,
                packet_name,
                recipient_display,
                child_display,
                completed_at: row.completed_at ?? null,
                summary: packet_name ? `Enrollment packet completed: ${packet_name}` : "Enrollment packet completed",
            },
        });
        return { error: null };
    } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
    }
}
