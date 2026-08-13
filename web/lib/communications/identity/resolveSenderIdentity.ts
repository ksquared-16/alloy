/**
 * Canonical sender identity resolver (pure — no I/O).
 * TypeScript is authoritative; Python consumes the same contract via shared fixtures.
 */

import { SENDER_FAILURE, senderFailureMessage } from "./failureCodes";
import type {
    CommunicationIdentityRow,
    IdentityGrantRow,
    IdentityResolutionContext,
    LegacyBindingRow,
    LocationBindingRow,
    ProviderAccountRow,
    SafeSenderMetadata,
    SelectionReason,
    SenderResolutionInput,
    SenderResolutionResult,
} from "./types";

function accountForIdentity(ctx: IdentityResolutionContext, identity: CommunicationIdentityRow): ProviderAccountRow | undefined {
    return ctx.accounts.find((a) => a.id === identity.provider_account_id && a.org_id === identity.org_id);
}

function isOutboundReady(identity: CommunicationIdentityRow, account: ProviderAccountRow | undefined): boolean {
    if (identity.status !== "active") return false;
    if (!identity.outbound_enabled) return false;
    if (!account || account.status !== "active") return false;
    const ref = (account.secret_ref || "").trim().toLowerCase();
    if (!ref || ref === "unconfigured") return false;
    return true;
}

function hasRequiredCapabilities(identity: CommunicationIdentityRow, required: string[] | undefined): boolean {
    if (!required?.length) return true;
    const caps = identity.capabilities ?? {};
    return required.every((k) => caps[k] === true || k === "outbound");
}

function grantsForIdentity(ctx: IdentityResolutionContext, identityId: string): IdentityGrantRow[] {
    return ctx.grants.filter((g) => g.identity_id === identityId && g.status === "active");
}

function operatorAuthorized(
    identity: CommunicationIdentityRow,
    grants: IdentityGrantRow[],
    operatorUserId: string | null,
    hasCommunicationsSend: boolean,
    mode: "send" | "override"
): boolean {
    if (!operatorUserId) return hasCommunicationsSend;
    if (grants.length === 0) return hasCommunicationsSend;
    const g = grants.find((x) => x.user_id === operatorUserId);
    if (!g) return false;
    if (mode === "override") return g.can_override_default || g.can_manage;
    return g.can_send || g.can_manage;
}

function locationBindingsFor(
    ctx: IdentityResolutionContext,
    locationId: string | null,
    channel: string
): LocationBindingRow[] {
    if (!locationId) return [];
    return ctx.locationBindings
        .filter(
            (b) =>
                b.location_id === locationId &&
                b.channel === channel &&
                b.status === "active" &&
                b.outbound_sending_enabled
        )
        .sort((a, b) => a.priority - b.priority || (a.is_default ? -1 : 1));
}

function identityById(ctx: IdentityResolutionContext, id: string, orgId: string): CommunicationIdentityRow | undefined {
    return ctx.identities.find((i) => i.id === id && i.org_id === orgId);
}

function identityByLegacyBinding(ctx: IdentityResolutionContext, bindingId: string, orgId: string): CommunicationIdentityRow | undefined {
    return ctx.identities.find((i) => i.legacy_binding_id === bindingId && i.org_id === orgId);
}

function eligibleIdentities(ctx: IdentityResolutionContext, input: SenderResolutionInput): CommunicationIdentityRow[] {
    return ctx.identities
        .filter((i) => i.org_id === input.orgId && i.channel === input.channel)
        .filter((i) => {
            const acct = accountForIdentity(ctx, i);
            return isOutboundReady(i, acct) && hasRequiredCapabilities(i, input.requiredCapabilities);
        });
}

function buildSuccess(
    ctx: IdentityResolutionContext,
    identity: CommunicationIdentityRow,
    reason: SelectionReason,
    fallbackLevel: number,
    locationBinding: LocationBindingRow | null,
    overrideUsed: boolean,
    warnings: string[]
): SenderResolutionResult {
    const account = accountForIdentity(ctx, identity);
    if (!account) {
        return {
            ok: false,
            failureCode: SENDER_FAILURE.NO_ELIGIBLE_IDENTITY,
            message: senderFailureMessage(SENDER_FAILURE.NO_ELIGIBLE_IDENTITY),
            warnings,
        };
    }
    if (account.health_status === "unavailable") {
        return {
            ok: false,
            failureCode: SENDER_FAILURE.PROVIDER_ACCOUNT_UNHEALTHY,
            message: senderFailureMessage(SENDER_FAILURE.PROVIDER_ACCOUNT_UNHEALTHY),
            warnings,
        };
    }
    const adapterKey = account.provider_type;
    const meta: SafeSenderMetadata = {
        identityId: identity.id,
        displayName: identity.display_name,
        fromAddress: identity.canonical_address,
        channel: identity.channel,
        providerAdapterKey: adapterKey,
    };
    const grants = grantsForIdentity(ctx, identity.id);
    return {
        ok: true,
        providerAccount: account,
        communicationIdentity: identity,
        locationBinding,
        selectionReason: reason,
        fallbackLevel,
        authorization: {
            allowed: true,
            usedGrant: grants.length > 0,
            overrideUsed,
        },
        capabilities: { ...identity.capabilities, outbound: identity.outbound_enabled },
        providerAdapterKey: adapterKey,
        safeSenderMetadata: meta,
        warnings,
        legacyBindingId: identity.legacy_binding_id,
    };
}

function resolveLegacyFallback(
    ctx: IdentityResolutionContext,
    input: SenderResolutionInput,
    warnings: string[]
): SenderResolutionResult {
    if (!input.allowLegacyCompatibilityFallback) {
        return {
            ok: false,
            failureCode: SENDER_FAILURE.NO_ELIGIBLE_IDENTITY,
            message: senderFailureMessage(SENDER_FAILURE.NO_ELIGIBLE_IDENTITY),
            warnings,
        };
    }
    const legacy = ctx.legacyBindings.filter(
        (b) => b.org_id === input.orgId && b.channel === input.channel && b.status === "active"
    );
    if (!legacy.length) {
        return {
            ok: false,
            failureCode: SENDER_FAILURE.NO_ELIGIBLE_IDENTITY,
            message: senderFailureMessage(SENDER_FAILURE.NO_ELIGIBLE_IDENTITY),
            warnings,
        };
    }
    let pick: LegacyBindingRow | undefined;
    if (input.locationId) {
        pick = legacy.find((b) => b.scope === "location" && b.location_id === input.locationId);
    }
    if (!pick) {
        const primaries = legacy.filter((b) => b.is_primary);
        pick = primaries[0] ?? legacy[0];
    }
    const mapped = pick ? identityByLegacyBinding(ctx, pick.id, input.orgId) : undefined;
    if (mapped) {
        warnings.push("legacy_compatibility_fallback_used");
        return buildSuccess(ctx, mapped, "legacy_compatibility_fallback", 90, null, false, warnings);
    }
    // Pre-backfill edge: no mapped identity yet — caller may still use legacy binding_id on message row.
    if (pick && input.allowLegacyCompatibilityFallback) {
        warnings.push("legacy_binding_only_no_canonical_identity");
        return {
            ok: false,
            failureCode: SENDER_FAILURE.NO_ELIGIBLE_IDENTITY,
            message: senderFailureMessage(SENDER_FAILURE.NO_ELIGIBLE_IDENTITY),
            warnings,
        };
    }
    return {
        ok: false,
        failureCode: SENDER_FAILURE.NO_ELIGIBLE_IDENTITY,
        message: senderFailureMessage(SENDER_FAILURE.NO_ELIGIBLE_IDENTITY),
        warnings,
    };
}

/** Deterministic sender resolution — canonical TypeScript implementation. */
export function resolveSenderIdentity(ctx: IdentityResolutionContext, input: SenderResolutionInput): SenderResolutionResult {
    const warnings: string[] = [];

    if (!input.orgId?.trim()) {
        return {
            ok: false,
            failureCode: SENDER_FAILURE.TENANT_MISSING,
            message: senderFailureMessage(SENDER_FAILURE.TENANT_MISSING),
            warnings,
        };
    }
    if (input.channel !== "sms" && input.channel !== "email") {
        return {
            ok: false,
            failureCode: SENDER_FAILURE.UNSUPPORTED_CHANNEL,
            message: senderFailureMessage(SENDER_FAILURE.UNSUPPORTED_CHANNEL),
            warnings,
        };
    }

    const pool = eligibleIdentities(ctx, input);
    const hasSend = input.operatorHasCommunicationsSend !== false;

    // 5. Explicit override
    const overrideId = input.requestedIdentityId?.trim();
    const legacyOverrideId = input.requestedLegacyBindingId?.trim();
    let overrideIdentity: CommunicationIdentityRow | undefined;
    if (overrideId) {
        overrideIdentity = identityById(ctx, overrideId, input.orgId);
    } else if (legacyOverrideId) {
        overrideIdentity = identityByLegacyBinding(ctx, legacyOverrideId, input.orgId);
    }
    if (overrideIdentity) {
        if (!pool.some((i) => i.id === overrideIdentity!.id)) {
            return {
                ok: false,
                failureCode: SENDER_FAILURE.OVERRIDE_INVALID,
                message: senderFailureMessage(SENDER_FAILURE.OVERRIDE_INVALID),
                warnings,
            };
        }
        const grants = grantsForIdentity(ctx, overrideIdentity.id);
        if (!operatorAuthorized(overrideIdentity, grants, input.operatorUserId, hasSend, "override")) {
            return {
                ok: false,
                failureCode: SENDER_FAILURE.OPERATOR_UNAUTHORIZED,
                message: senderFailureMessage(SENDER_FAILURE.OPERATOR_UNAUTHORIZED),
                warnings,
            };
        }
        const locBind = input.locationId
            ? ctx.locationBindings.find(
                  (b) => b.identity_id === overrideIdentity!.id && b.location_id === input.locationId && b.status === "active"
              ) ?? null
            : null;
        return buildSuccess(ctx, overrideIdentity, "explicit_authorized_override", 0, locBind, true, warnings);
    } else if (overrideId || legacyOverrideId) {
        return {
            ok: false,
            failureCode: SENDER_FAILURE.OVERRIDE_INVALID,
            message: senderFailureMessage(SENDER_FAILURE.OVERRIDE_INVALID),
            warnings,
        };
    }

    // 6–7. Location default / priority
    if (input.locationId) {
        const locBinds = locationBindingsFor(ctx, input.locationId, input.channel);
        const defaultBind = locBinds.find((b) => b.is_default);
        const ordered = defaultBind ? [defaultBind, ...locBinds.filter((b) => b.id !== defaultBind.id)] : locBinds;
        for (const lb of ordered) {
            const ident = pool.find((i) => i.id === lb.identity_id);
            if (!ident) continue;
            const grants = grantsForIdentity(ctx, ident.id);
            if (!operatorAuthorized(ident, grants, input.operatorUserId, hasSend, "send")) continue;
            const reason: SelectionReason = lb.is_default ? "location_default" : "location_priority";
            return buildSuccess(ctx, ident, reason, lb.is_default ? 10 : 20, lb, false, warnings);
        }
        // REMOVED — a fallback that matched any `scope='location'` identity in the
        // organization, with NO predicate on WHICH location it belonged to.
        //
        // It was structurally incapable of being correct: `communication_identities`
        // has no `location_id` at all — location lives only in
        // `communication_identity_location_bindings`. So the branch took the first
        // location-scoped identity it found and returned it for whatever location
        // was asked about. A Lakeside conversation resolved to Riverside's address.
        // Harmless only while this resolver was dormant; activating it would have
        // shipped cross-location identity leakage on day one.
        //
        // Deleted rather than repaired. It existed to cover identities backfilled
        // with `scope='location'` before any location binding row was written.
        // Projection now writes that row in the same request as the binding, so a
        // location identity always has one. An identity whose location cannot be
        // determined must fall through to the organization default — a truthful
        // answer — instead of guessing a location and sending as the wrong campus.
    }

    // 9. Tenant-wide default (deterministic: id sort among defaults)
    const tenantDefaults = pool
        .filter((i) => i.is_default_for_scope && i.scope === "tenant")
        .sort((a, b) => a.id.localeCompare(b.id));
    for (const ident of tenantDefaults) {
        const grants = grantsForIdentity(ctx, ident.id);
        if (operatorAuthorized(ident, grants, input.operatorUserId, hasSend, "send")) {
            return buildSuccess(ctx, ident, "tenant_default", 30, null, false, warnings);
        }
    }

    // Any tenant-scoped eligible identity (deterministic: id sort)
    const tenantPool = pool
        .filter((i) => i.scope === "tenant" || i.scope === "system")
        .sort((a, b) => a.id.localeCompare(b.id));
    for (const ident of tenantPool) {
        const grants = grantsForIdentity(ctx, ident.id);
        if (operatorAuthorized(ident, grants, input.operatorUserId, hasSend, "send")) {
            return buildSuccess(ctx, ident, "tenant_default", 40, null, false, warnings);
        }
    }

    // 10. Legacy compatibility
    return resolveLegacyFallback(ctx, input, warnings);
}

/** Serialize resolution result for Python worker consumption (persist on message metadata). */
export function serializeSenderResolution(result: SenderResolutionResult): Record<string, unknown> {
    if (!result.ok) {
        return { ok: false, failure_code: result.failureCode, message: result.message, warnings: result.warnings };
    }
    return {
        ok: true,
        communication_identity_id: result.communicationIdentity.id,
        communication_provider_account_id: result.providerAccount.id,
        selection_reason: result.selectionReason,
        fallback_level: result.fallbackLevel,
        provider_adapter_key: result.providerAdapterKey,
        legacy_binding_id: result.legacyBindingId,
        safe_sender_metadata: result.safeSenderMetadata,
        warnings: result.warnings,
    };
}
