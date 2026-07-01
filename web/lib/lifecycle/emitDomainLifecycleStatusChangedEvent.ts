/**
 * Thin bridge from domain SoT lifecycle events into canonical status + BP stage-entry spawn.
 *
 * Wraps the same opportunity status path used by admin PATCH and book-v2 — no parallel workflow engine.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { updateOpportunityStatusWithEvent } from "@/lib/opportunities/updateOpportunityStatusWithEvent";

/** Fallback actor when domain events have no staff user (enables BP stage-entry spawn). */
export const DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID = "00000000-0000-0000-0000-000000000000";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function resolveDomainLifecycleActorUserId(actorUserId?: string | null): string {
    const trimmed = String(actorUserId ?? "").trim();
    if (UUID_RE.test(trimmed)) return trimmed;
    return DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID;
}

export type EmitDomainLifecycleStatusChangedEventParams = {
    supabase: SupabaseClient;
    orgId: string;
    entityType: "opportunities";
    entityId: string;
    previousStatusKey?: string | null;
    nextStatusKey: string | null;
    domain: string;
    domainEntityId?: string | null;
    actorUserId?: string | null;
    additionalPatch?: Record<string, unknown>;
    normalizeContext: string;
    eventMetadata?: Record<string, unknown>;
};

/**
 * Domain lifecycle → opportunity status change → emitStatusChangedEvent → onStageEntrySpawnWorkIntent.
 */
export async function emitDomainLifecycleStatusChangedEvent(
    params: EmitDomainLifecycleStatusChangedEventParams,
): Promise<{ error: { message: string } | null }> {
    const orgId = params.orgId.trim();
    const entityId = params.entityId.trim();
    const domain = params.domain.trim();
    if (!orgId || !entityId || !domain) {
        return { error: { message: "Missing domain lifecycle scope" } };
    }

    const actorUserId = resolveDomainLifecycleActorUserId(params.actorUserId);
    const eventMetadata: Record<string, unknown> = {
        source: "domain_lifecycle",
        domain,
        ...(params.domainEntityId ? { domain_entity_id: String(params.domainEntityId).trim() } : {}),
        ...(params.eventMetadata ?? {}),
    };

    return updateOpportunityStatusWithEvent({
        supabase: params.supabase,
        orgId,
        opportunityId: entityId,
        newStatusKey: params.nextStatusKey,
        ...(Object.prototype.hasOwnProperty.call(params, "previousStatusKey")
            ? { previousStatusKey: params.previousStatusKey ?? null }
            : {}),
        additionalPatch: params.additionalPatch,
        actorUserId,
        eventMetadata,
        normalizeContext: params.normalizeContext,
    });
}
