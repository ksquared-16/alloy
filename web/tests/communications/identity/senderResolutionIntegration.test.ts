import { describe, expect, it } from "vitest";

import { resolveSenderIdentity } from "@/lib/communications/identity/resolveSenderIdentity";
import { SENDER_FAILURE } from "@/lib/communications/identity/failureCodes";
import type { IdentityResolutionContext } from "@/lib/communications/identity/types";

const ORG = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const LOC = "33333333-3333-3333-3333-333333333333";
const USER = "44444444-4444-4444-4444-444444444444";

function mkAccount(id: string, orgId: string, provider: string, secretRef = "env:KEY") {
    return {
        id,
        org_id: orgId,
        provider_type: provider,
        display_label: provider,
        status: "active" as const,
        verification_state: "verified" as const,
        health_status: "healthy" as const,
        secret_ref: secretRef,
        capabilities: {},
        config: provider === "twilio" ? { messaging_service_sid: "MG" } : { from_email: "a@b.org" },
        provider_account_ref: null,
        legacy_binding_id: null,
        metadata: {},
    };
}

function mkIdentity(
    id: string,
    orgId: string,
    accountId: string,
    channel: "sms" | "email",
    address: string,
    opts?: Partial<{ scope: "tenant" | "location"; isDefault: boolean; outbound: boolean; status: "active" | "disabled"; verification: "verified" | "pending" }>
) {
    return {
        id,
        org_id: orgId,
        provider_account_id: accountId,
        channel,
        identity_type: channel === "sms" ? "phone_number" : "shared_mailbox",
        canonical_address: address,
        normalized_address: address,
        display_name: address,
        inbound_enabled: true,
        outbound_enabled: opts?.outbound ?? true,
        verification_state: opts?.verification ?? "verified",
        status: opts?.status ?? "active",
        health_status: "healthy" as const,
        capabilities: {},
        provider_resource_ref: null,
        scope: opts?.scope ?? "tenant",
        is_default_for_scope: opts?.isDefault ?? false,
        legacy_binding_id: null,
        metadata: {},
    };
}

describe("resolveSenderIdentity integration matrix", () => {
    it("rejects cross-tenant override", () => {
        const ctx: IdentityResolutionContext = {
            accounts: [mkAccount("a1", ORG, "twilio")],
            identities: [mkIdentity("i1", ORG_B, "a1", "sms", "+15551111111")],
            locationBindings: [],
            grants: [],
            legacyBindings: [],
        };
        const r = resolveSenderIdentity(ctx, {
            orgId: ORG,
            channel: "sms",
            operatorUserId: USER,
            locationId: null,
            requestedIdentityId: "i1",
            operatorHasCommunicationsSend: true,
        });
        expect(r.ok).toBe(false);
    });

    it("rejects disabled identity in pool", () => {
        const ctx: IdentityResolutionContext = {
            accounts: [mkAccount("a1", ORG, "twilio")],
            identities: [mkIdentity("i1", ORG, "a1", "sms", "+15551111111", { status: "disabled" })],
            locationBindings: [],
            grants: [],
            legacyBindings: [],
        };
        const r = resolveSenderIdentity(ctx, {
            orgId: ORG,
            channel: "sms",
            operatorUserId: USER,
            locationId: null,
            operatorHasCommunicationsSend: true,
            allowLegacyCompatibilityFallback: false,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.failureCode).toBe(SENDER_FAILURE.NO_ELIGIBLE_IDENTITY);
    });

    it("rejects unverified identity when secret unconfigured on account", () => {
        const ctx: IdentityResolutionContext = {
            accounts: [mkAccount("a1", ORG, "twilio", "unconfigured")],
            identities: [mkIdentity("i1", ORG, "a1", "sms", "+15551111111")],
            locationBindings: [],
            grants: [],
            legacyBindings: [],
        };
        const r = resolveSenderIdentity(ctx, {
            orgId: ORG,
            channel: "sms",
            operatorUserId: USER,
            locationId: null,
            operatorHasCommunicationsSend: true,
            allowLegacyCompatibilityFallback: false,
        });
        expect(r.ok).toBe(false);
    });

    it("selects higher-priority location binding deterministically", () => {
        const ctx: IdentityResolutionContext = {
            accounts: [mkAccount("a1", ORG, "twilio"), mkAccount("a2", ORG, "twilio")],
            identities: [
                mkIdentity("i-low", ORG, "a1", "sms", "+15551111111", { scope: "location" }),
                mkIdentity("i-high", ORG, "a2", "sms", "+15552222222", { scope: "location", isDefault: true }),
            ],
            locationBindings: [
                { id: "lb1", org_id: ORG, identity_id: "i-low", location_id: LOC, channel: "sms", priority: 50, is_default: false, inbound_routing_enabled: true, outbound_sending_enabled: true, status: "active" },
                { id: "lb2", org_id: ORG, identity_id: "i-high", location_id: LOC, channel: "sms", priority: 0, is_default: true, inbound_routing_enabled: true, outbound_sending_enabled: true, status: "active" },
            ],
            grants: [],
            legacyBindings: [],
        };
        const r = resolveSenderIdentity(ctx, {
            orgId: ORG,
            channel: "sms",
            operatorUserId: USER,
            locationId: LOC,
            operatorHasCommunicationsSend: true,
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.communicationIdentity.id).toBe("i-high");
            expect(r.locationBinding?.id).toBe("lb2");
            expect(r.selectionReason).toBe("location_default");
        }
    });

    it("returns provider account and identity ids on success", () => {
        const ctx: IdentityResolutionContext = {
            accounts: [mkAccount("a1", ORG, "resend")],
            identities: [mkIdentity("i1", ORG, "a1", "email", "noreply@test.org", { isDefault: true })],
            locationBindings: [],
            grants: [],
            legacyBindings: [],
        };
        const r = resolveSenderIdentity(ctx, {
            orgId: ORG,
            channel: "email",
            operatorUserId: USER,
            locationId: null,
            operatorHasCommunicationsSend: true,
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.providerAccount.id).toBe("a1");
            expect(r.communicationIdentity.id).toBe("i1");
            expect(r.safeSenderMetadata.fromAddress).toBe("noreply@test.org");
            expect(r.authorization.allowed).toBe(true);
        }
    });

    it("does not depend on array insertion order for tenant fallback", () => {
        const ctx: IdentityResolutionContext = {
            accounts: [mkAccount("a1", ORG, "twilio")],
            identities: [
                mkIdentity("i-z", ORG, "a1", "sms", "+15559999999", { isDefault: true }),
                mkIdentity("i-a", ORG, "a1", "sms", "+15551111111", { isDefault: true }),
            ],
            locationBindings: [],
            grants: [],
            legacyBindings: [],
        };
        const r1 = resolveSenderIdentity(ctx, { orgId: ORG, channel: "sms", operatorUserId: USER, locationId: null, operatorHasCommunicationsSend: true });
        ctx.identities.reverse();
        const r2 = resolveSenderIdentity(ctx, { orgId: ORG, channel: "sms", operatorUserId: USER, locationId: null, operatorHasCommunicationsSend: true });
        expect(r1.ok).toBe(true);
        expect(r2.ok).toBe(true);
        if (r1.ok && r2.ok) {
            expect(r1.communicationIdentity.id).toBe(r2.communicationIdentity.id);
        }
    });
});
