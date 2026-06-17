/**
 * Enrollment packet domain events → child disposition + BP stage work (forms SoT unchanged).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOpportunityIdForPacketSession } from "@/lib/forms/workflow/opportunityEnrollmentPacketProjections";
import { emitDomainChildLifecycleStatusChangedEvent } from "@/lib/lifecycle/emitDomainChildLifecycleStatusChangedEvent";
import { onChildDispositionEntrySpawnWorkIntent } from "@/lib/lifecycle/onChildDispositionEntrySpawnWorkIntent";
import {
    mergeEnrollmentOperationalIntoMetadata,
    sanitizeEnrollmentOperationalPatch,
} from "@/lib/opportunities/enrollmentOperationalMetadata";

const PACKET_DOMAIN = "enrollment_packet" as const;

export type EnrollmentPacketLifecycleKind =
    | "packet_sent"
    | "submitted_for_review"
    | "review_approved"
    | "review_needs_correction"
    | "review_rejected";

async function resolvePrimaryOcmForPacket(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    customerMemberId: string | null,
): Promise<{ id: string; outcome_status_key: string | null } | null> {
    if (customerMemberId) {
        const { data } = await supabase
            .from("opportunity_customer_members")
            .select("id, outcome_status_key")
            .eq("org_id", orgId)
            .eq("opportunity_id", opportunityId)
            .eq("customer_member_id", customerMemberId)
            .maybeSingle();
        if (data?.id) return data as { id: string; outcome_status_key: string | null };
    }
    const { data: rows } = await supabase
        .from("opportunity_customer_members")
        .select("id, outcome_status_key")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: true })
        .limit(1);
    return (rows?.[0] as { id: string; outcome_status_key: string | null } | undefined) ?? null;
}

async function setPacketAttention(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    reason: string,
): Promise<void> {
    const { data: opp } = await supabase
        .from("opportunities")
        .select("metadata")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!opp) return;
    const md =
        opp.metadata != null && typeof opp.metadata === "object" && !Array.isArray(opp.metadata)
            ? (opp.metadata as Record<string, unknown>)
            : {};
    const patch = sanitizeEnrollmentOperationalPatch({
        wait_bucket: "waiting_on_family",
        wait_reason: reason,
        wait_since: new Date().toISOString(),
    });
    if (!patch) return;
    const merged = mergeEnrollmentOperationalIntoMetadata(md, patch);
    await supabase
        .from("opportunities")
        .update({ metadata: merged, updated_at: new Date().toISOString() })
        .eq("id", opportunityId)
        .eq("org_id", orgId);
}

export async function applyEnrollmentPacketBusinessProcessIntegration(params: {
    supabase: SupabaseClient;
    orgId: string;
    packetSessionId: string;
    kind: EnrollmentPacketLifecycleKind;
    actorUserId?: string | null;
    customerMemberId?: string | null;
}): Promise<void> {
    const { supabase, orgId, packetSessionId, kind, actorUserId } = params;
    const opportunityId = await resolveOpportunityIdForPacketSession(supabase, orgId, packetSessionId);
    if (!opportunityId) return;

    const ocm = await resolvePrimaryOcmForPacket(supabase, orgId, opportunityId, params.customerMemberId ?? null);
    if (!ocm?.id) return;

    const previous = ocm.outcome_status_key;

    if (kind === "packet_sent") {
        const result = await emitDomainChildLifecycleStatusChangedEvent({
            supabase,
            orgId,
            opportunityId,
            opportunityCustomerMemberId: ocm.id,
            previousStatusKey: previous,
            nextStatusKey: "registration_pending",
            domain: PACKET_DOMAIN,
            domainEntityId: packetSessionId,
            actorUserId,
            source: "domain_lifecycle:enrollment_packet",
            metadata: { packet_session_id: packetSessionId, kind },
        });
        if (result.error) throw new Error(result.error.message);
        await onChildDispositionEntrySpawnWorkIntent({
            supabase,
            orgId,
            userId: actorUserId,
            opportunityId,
            previousStatusKey: previous,
            nextStatusKey: "registration_pending",
        });
        return;
    }

    if (kind === "submitted_for_review") {
        const result = await emitDomainChildLifecycleStatusChangedEvent({
            supabase,
            orgId,
            opportunityId,
            opportunityCustomerMemberId: ocm.id,
            previousStatusKey: previous,
            nextStatusKey: "paperwork_pending",
            domain: PACKET_DOMAIN,
            domainEntityId: packetSessionId,
            actorUserId,
            source: "domain_lifecycle:enrollment_packet",
            metadata: { packet_session_id: packetSessionId, kind },
        });
        if (result.error) throw new Error(result.error.message);
        await onChildDispositionEntrySpawnWorkIntent({
            supabase,
            orgId,
            userId: actorUserId,
            opportunityId,
            previousStatusKey: previous,
            nextStatusKey: "paperwork_pending",
        });
        return;
    }

    if (kind === "review_approved") {
        const result = await emitDomainChildLifecycleStatusChangedEvent({
            supabase,
            orgId,
            opportunityId,
            opportunityCustomerMemberId: ocm.id,
            previousStatusKey: previous,
            nextStatusKey: "start_date_scheduled",
            domain: PACKET_DOMAIN,
            domainEntityId: packetSessionId,
            actorUserId,
            source: "domain_lifecycle:enrollment_packet",
            metadata: { packet_session_id: packetSessionId, kind },
        });
        if (result.error) throw new Error(result.error.message);
        await onChildDispositionEntrySpawnWorkIntent({
            supabase,
            orgId,
            userId: actorUserId,
            opportunityId,
            previousStatusKey: previous,
            nextStatusKey: "start_date_scheduled",
        });
        return;
    }

    if (kind === "review_needs_correction") {
        await setPacketAttention(supabase, orgId, opportunityId, "Enrollment packet needs correction");
        return;
    }

    if (kind === "review_rejected") {
        const result = await emitDomainChildLifecycleStatusChangedEvent({
            supabase,
            orgId,
            opportunityId,
            opportunityCustomerMemberId: ocm.id,
            previousStatusKey: previous,
            nextStatusKey: "family_withdrew",
            domain: PACKET_DOMAIN,
            domainEntityId: packetSessionId,
            actorUserId,
            source: "domain_lifecycle:enrollment_packet",
            metadata: { packet_session_id: packetSessionId, kind },
        });
        if (result.error) throw new Error(result.error.message);
    }
}
