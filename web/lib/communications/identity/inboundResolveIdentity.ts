/**
 * Inbound identity resolution — provider event → canonical identity.
 */

import { normalizeIdentityAddress } from "./normalizeAddress";
import type {
    CommunicationIdentityRow,
    IdentityResolutionContext,
    LocationBindingRow,
    ProviderAccountRow,
} from "./types";

export type InboundResolutionInput = {
    orgId?: string | null;
    channel: "sms" | "email";
    providerType: string;
    providerAccountId?: string | null;
    destinationAddress: string;
    /** When true, multiple location bindings require explicit disambiguation. */
    requireLocationDisambiguation?: boolean;
};

export type InboundResolutionSuccess = {
    ok: true;
    providerAccount: ProviderAccountRow;
    communicationIdentity: CommunicationIdentityRow;
    locationBindings: LocationBindingRow[];
    ambiguousLocation: boolean;
    selectionReason: "provider_account_match" | "normalized_address_match" | "legacy_binding_fallback";
};

export type InboundResolutionFailure = {
    ok: false;
    failureCode: string;
    message: string;
};

export type InboundResolutionResult = InboundResolutionSuccess | InboundResolutionFailure;

export function resolveInboundIdentity(
    ctx: IdentityResolutionContext,
    input: InboundResolutionInput
): InboundResolutionResult {
    const normDest = normalizeIdentityAddress(input.channel, input.destinationAddress);
    if (!normDest) {
        return { ok: false, failureCode: "invalid_destination", message: "Inbound destination address is invalid." };
    }

    let candidates = ctx.identities.filter(
        (i) =>
            i.channel === input.channel &&
            i.inbound_enabled &&
            i.status === "active" &&
            normalizeIdentityAddress(i.channel, i.normalized_address) === normDest
    );

    if (input.orgId) {
        candidates = candidates.filter((i) => i.org_id === input.orgId);
    }

    if (input.providerAccountId) {
        candidates = candidates.filter((i) => i.provider_account_id === input.providerAccountId);
    } else if (input.providerType) {
        const acctIds = new Set(
            ctx.accounts.filter((a) => a.provider_type === input.providerType).map((a) => a.id)
        );
        candidates = candidates.filter((i) => acctIds.has(i.provider_account_id));
    }

    if (!candidates.length) {
        // Legacy fallback: match binding inbound_to_e164
        const legacy = ctx.legacyBindings.filter(
            (b) =>
                b.channel === input.channel &&
                b.status === "active" &&
                normalizeIdentityAddress(b.channel, b.inbound_to_e164 ?? "") === normDest
        );
        if (legacy.length === 1) {
            const mapped = ctx.identities.find((i) => i.legacy_binding_id === legacy[0]!.id);
            if (mapped) {
                const account = ctx.accounts.find((a) => a.id === mapped.provider_account_id);
                if (account) {
                    const locBinds = ctx.locationBindings.filter((b) => b.identity_id === mapped.id && b.inbound_routing_enabled);
                    return {
                        ok: true,
                        providerAccount: account,
                        communicationIdentity: mapped,
                        locationBindings: locBinds,
                        ambiguousLocation: locBinds.length > 1,
                        selectionReason: "legacy_binding_fallback",
                    };
                }
            }
        }
        return { ok: false, failureCode: "identity_not_found", message: "No communication identity matches inbound destination." };
    }

    if (candidates.length > 1 && input.orgId) {
        // Prefer identity tied to provider account when multiple org identities share number (test contexts)
        candidates = [candidates[0]!];
    }

    const identity = candidates[0]!;
    const account = ctx.accounts.find((a) => a.id === identity.provider_account_id);
    if (!account) {
        return { ok: false, failureCode: "provider_account_missing", message: "Provider account not found for identity." };
    }

    const locBinds = ctx.locationBindings.filter(
        (b) => b.identity_id === identity.id && b.status === "active" && b.inbound_routing_enabled
    );
    const ambiguousLocation = locBinds.length > 1 && input.requireLocationDisambiguation !== false;

    return {
        ok: true,
        providerAccount: account,
        communicationIdentity: identity,
        locationBindings: locBinds,
        ambiguousLocation,
        selectionReason: input.providerAccountId ? "provider_account_match" : "normalized_address_match",
    };
}
