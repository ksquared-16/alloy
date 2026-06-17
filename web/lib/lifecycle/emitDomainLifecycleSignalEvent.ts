/**
 * Generic domain signal → configured stage automation rules (no status change).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyConfiguredStageRulesForDomainSignal } from "@/lib/lifecycle/applyConfiguredStageAutomationRules";

export type EmitDomainLifecycleSignalEventParams = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    domain: string;
    signal: string;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
};

export async function emitDomainLifecycleSignalEvent(
    params: EmitDomainLifecycleSignalEventParams,
): Promise<{ error: { message: string } | null }> {
    const orgId = params.orgId.trim();
    const opportunityId = params.opportunityId.trim();
    const domain = params.domain.trim();
    const signal = params.signal.trim();
    if (!orgId || !opportunityId || !domain || !signal) {
        return { error: { message: "Missing domain lifecycle signal scope" } };
    }

    const result = await applyConfiguredStageRulesForDomainSignal({
        supabase: params.supabase,
        orgId,
        opportunityId,
        domain,
        signal,
        actorUserId: params.actorUserId,
    });

    if (result.errors.length) {
        return { error: { message: result.errors.join("; ") } };
    }
    return { error: null };
}
