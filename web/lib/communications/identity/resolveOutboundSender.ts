import type { SupabaseClient } from "@supabase/supabase-js";

import { loadIdentityResolutionContext } from "./loadIdentityContext";
import { resolveSenderIdentity } from "./resolveSenderIdentity";
import type { SenderResolutionInput, SenderResolutionResult } from "./types";

export type ResolveOutboundSenderParams = Omit<SenderResolutionInput, "allowLegacyCompatibilityFallback"> & {
    supabase: SupabaseClient;
    allowLegacyCompatibilityFallback?: boolean;
};

/** DB-backed canonical outbound sender resolution. */
export async function resolveOutboundSender(params: ResolveOutboundSenderParams): Promise<SenderResolutionResult> {
    const ctx = await loadIdentityResolutionContext(params.supabase, params.orgId);
    return resolveSenderIdentity(ctx, {
        orgId: params.orgId,
        channel: params.channel,
        operatorUserId: params.operatorUserId ?? null,
        locationId: params.locationId ?? null,
        primaryEntityType: params.primaryEntityType ?? null,
        primaryEntityId: params.primaryEntityId ?? null,
        messagePurpose: params.messagePurpose ?? null,
        requestedIdentityId: params.requestedIdentityId ?? null,
        requestedLegacyBindingId: params.requestedLegacyBindingId ?? null,
        requiredCapabilities: params.requiredCapabilities,
        allowLegacyCompatibilityFallback: params.allowLegacyCompatibilityFallback !== false,
        operatorHasCommunicationsSend: params.operatorHasCommunicationsSend,
    });
}
