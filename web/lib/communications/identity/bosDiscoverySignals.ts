/**
 * BOS / provider-health discovery signals (structured facts only — no AI).
 */

import type { CommunicationIdentityRow, IdentityResolutionContext, ProviderAccountRow } from "./types";

export type BosDiscoverySignal =
    | "location_has_no_sms_identity"
    | "location_has_no_email_identity"
    | "email_identity_unverified"
    | "sms_identity_unverified"
    | "provider_account_degraded"
    | "provider_account_unavailable"
    | "user_has_no_eligible_sender"
    | "identity_override_not_permitted";

export type BosDiscoverySnapshot = {
    signals: BosDiscoverySignal[];
    identities: Array<{
        id: string;
        channel: string;
        displayName: string | null;
        status: string;
        verificationState: string;
        healthStatus: string;
        scope: string;
        outboundEnabled: boolean;
        inboundEnabled: boolean;
    }>;
    providerAccounts: Array<{
        id: string;
        providerType: string;
        status: string;
        healthStatus: string;
        verificationState: string;
    }>;
};

export function buildBosDiscoverySnapshot(
    ctx: IdentityResolutionContext,
    opts?: { locationId?: string | null; userId?: string | null }
): BosDiscoverySnapshot {
    const signals: BosDiscoverySignal[] = [];
    const locationId = opts?.locationId ?? null;

    for (const acct of ctx.accounts) {
        if (acct.health_status === "degraded") signals.push("provider_account_degraded");
        if (acct.health_status === "unavailable") signals.push("provider_account_unavailable");
    }

    for (const ident of ctx.identities) {
        if (ident.channel === "email" && ident.verification_state !== "verified" && ident.outbound_enabled) {
            signals.push("email_identity_unverified");
        }
        if (ident.channel === "sms" && ident.verification_state !== "verified" && ident.outbound_enabled) {
            signals.push("sms_identity_unverified");
        }
    }

    if (locationId) {
        for (const ch of ["sms", "email"] as const) {
            const hasLoc = ctx.locationBindings.some(
                (b) => b.location_id === locationId && b.channel === ch && b.status === "active"
            );
            if (!hasLoc) {
                signals.push(ch === "sms" ? "location_has_no_sms_identity" : "location_has_no_email_identity");
            }
        }
    }

    const mapIdent = (i: CommunicationIdentityRow) => ({
        id: i.id,
        channel: i.channel,
        displayName: i.display_name,
        status: i.status,
        verificationState: i.verification_state,
        healthStatus: i.health_status,
        scope: i.scope,
        outboundEnabled: i.outbound_enabled,
        inboundEnabled: i.inbound_enabled,
    });

    const mapAcct = (a: ProviderAccountRow) => ({
        id: a.id,
        providerType: a.provider_type,
        status: a.status,
        healthStatus: a.health_status,
        verificationState: a.verification_state,
    });

    return {
        signals: [...new Set(signals)],
        identities: ctx.identities.map(mapIdent),
        providerAccounts: ctx.accounts.map(mapAcct),
    };
}
