/**
 * Domain SoT → child disposition update → child lifecycle event → BP stage-entry spawn.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID } from "@/lib/lifecycle/emitDomainLifecycleStatusChangedEvent";
import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function resolveActorUserId(actorUserId?: string | null): string | null {
    const trimmed = String(actorUserId ?? "").trim();
    return UUID_RE.test(trimmed) ? trimmed : DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID;
}

export type EmitDomainChildLifecycleStatusChangedEventParams = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    opportunityCustomerMemberId: string;
    previousStatusKey?: string | null;
    nextStatusKey: string | null;
    domain: string;
    domainEntityId?: string | null;
    actorUserId?: string | null;
    source?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
};

/** Child disposition change through canonical OCM update path (includes child_lifecycle_status_changed). */
export async function emitDomainChildLifecycleStatusChangedEvent(
    params: EmitDomainChildLifecycleStatusChangedEventParams,
): Promise<{ error: { message: string } | null }> {
    const orgId = params.orgId.trim();
    const opportunityId = params.opportunityId.trim();
    const ocmId = params.opportunityCustomerMemberId.trim();
    const domain = params.domain.trim();
    if (!orgId || !opportunityId || !ocmId || !domain) {
        return { error: { message: "Missing domain child lifecycle scope" } };
    }

    const result = await updateOpportunityCustomerMemberLifecycleStatus({
        supabase: params.supabase,
        orgId,
        opportunityId,
        opportunityCustomerMemberId: ocmId,
        nextStatusKey: params.nextStatusKey,
        ...(Object.prototype.hasOwnProperty.call(params, "previousStatusKey")
            ? { previousStatusKey: params.previousStatusKey ?? null }
            : {}),
        actorUserId: resolveActorUserId(params.actorUserId),
        source: params.source ?? "domain_lifecycle",
        reason: params.reason ?? null,
        rowGrain: "child",
        metadata: {
            domain,
            ...(params.domainEntityId ? { domain_entity_id: String(params.domainEntityId).trim() } : {}),
            ...(params.metadata ?? {}),
        },
    });

    if (result.error) return { error: result.error };
    return { error: null };
}
