/**
 * Structured observability for Communications Identity resolution (no secrets).
 */

export type IdentityResolutionEvent =
    | "canonical_identity_resolved"
    | "legacy_compatibility_resolved"
    | "python_deferred_resolution"
    | "workflow_mirror_resolution_deferred"
    | "missing_identity"
    | "inbound_identity_ambiguous"
    | "inbound_location_ambiguous"
    | "unauthorized_override"
    | "provider_account_unhealthy"
    | "identity_verification_failure"
    | "resolution_failed";

export type IdentityResolutionLogPayload = {
    event: IdentityResolutionEvent;
    org_id_tail?: string | null;
    channel?: string | null;
    selection_reason?: string | null;
    fallback_level?: number | null;
    failure_code?: string | null;
    communication_identity_id?: string | null;
    communication_provider_account_id?: string | null;
    source?: string | null;
    warnings?: string[];
};

function orgTail(orgId: string | null | undefined): string | null {
    const s = (orgId || "").trim();
    if (s.length < 8) return null;
    return s.slice(-8);
}

/** Console-safe structured log — use existing [communications] prefix convention. */
export function logIdentityResolution(payload: IdentityResolutionLogPayload): void {
    const safe: Record<string, unknown> = {
        event: payload.event,
        org_id_tail: payload.org_id_tail ?? null,
        channel: payload.channel ?? null,
        selection_reason: payload.selection_reason ?? null,
        fallback_level: payload.fallback_level ?? null,
        failure_code: payload.failure_code ?? null,
        source: payload.source ?? null,
    };
    if (payload.communication_identity_id) safe.communication_identity_id = payload.communication_identity_id;
    if (payload.communication_provider_account_id) safe.communication_provider_account_id = payload.communication_provider_account_id;
    if (payload.warnings?.length) safe.warnings = payload.warnings;
    console.info("[communications:identity]", JSON.stringify(safe));
}

export function logCanonicalResolution(params: {
    orgId: string;
    channel: string;
    selectionReason: string;
    fallbackLevel: number;
    identityId: string;
    accountId: string;
    source: string;
    warnings?: string[];
}): void {
    logIdentityResolution({
        event: params.selectionReason === "legacy_compatibility_fallback" ? "legacy_compatibility_resolved" : "canonical_identity_resolved",
        org_id_tail: orgTail(params.orgId),
        channel: params.channel,
        selection_reason: params.selectionReason,
        fallback_level: params.fallbackLevel,
        communication_identity_id: params.identityId,
        communication_provider_account_id: params.accountId,
        source: params.source,
        warnings: params.warnings,
    });
}

export function logResolutionFailure(params: {
    orgId: string;
    channel: string;
    failureCode: string;
    source: string;
    event?: IdentityResolutionEvent;
}): void {
    logIdentityResolution({
        event: params.event ?? "resolution_failed",
        org_id_tail: orgTail(params.orgId),
        channel: params.channel,
        failure_code: params.failureCode,
        source: params.source,
    });
}
