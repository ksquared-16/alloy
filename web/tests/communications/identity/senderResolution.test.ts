import { describe, expect, it } from "vitest";

import { resolveInboundIdentity } from "@/lib/communications/identity/inboundResolveIdentity";
import { resolveSenderIdentity } from "@/lib/communications/identity/resolveSenderIdentity";
import { SENDER_FAILURE } from "@/lib/communications/identity/failureCodes";
import type { IdentityResolutionContext } from "@/lib/communications/identity/types";

const ORG = "11111111-1111-1111-1111-111111111111";
const LOC = "22222222-2222-2222-2222-222222222222";
const USER = "33333333-3333-3333-3333-333333333333";
const ACCT_SMS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACCT_EMAIL = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const IDENT_SMS_LOC = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const IDENT_SMS_TENANT = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const IDENT_EMAIL = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const LEGACY_BIND = "ffffffff-ffff-ffff-ffff-ffffffffffff";

function baseCtx(): IdentityResolutionContext {
    return {
        accounts: [
            {
                id: ACCT_SMS,
                org_id: ORG,
                provider_type: "twilio",
                display_label: "Twilio",
                status: "active",
                verification_state: "verified",
                health_status: "healthy",
                secret_ref: "env:TWILIO_AUTH",
                capabilities: {},
                config: { messaging_service_sid: "MG123" },
                provider_account_ref: null,
                legacy_binding_id: null,
                metadata: {},
            },
            {
                id: ACCT_EMAIL,
                org_id: ORG,
                provider_type: "resend",
                display_label: "Resend",
                status: "active",
                verification_state: "verified",
                health_status: "healthy",
                secret_ref: "env:RESEND_API_KEY",
                capabilities: {},
                config: { from_email: "noreply@example.org" },
                provider_account_ref: null,
                legacy_binding_id: LEGACY_BIND,
                metadata: {},
            },
        ],
        identities: [
            {
                id: IDENT_SMS_LOC,
                org_id: ORG,
                provider_account_id: ACCT_SMS,
                channel: "sms",
                identity_type: "phone_number",
                canonical_address: "+15551234567",
                normalized_address: "+15551234567",
                display_name: "North Campus SMS",
                inbound_enabled: true,
                outbound_enabled: true,
                verification_state: "verified",
                status: "active",
                health_status: "healthy",
                capabilities: {},
                provider_resource_ref: "MG123",
                scope: "location",
                is_default_for_scope: true,
                legacy_binding_id: null,
                metadata: {},
            },
            {
                id: IDENT_SMS_TENANT,
                org_id: ORG,
                provider_account_id: ACCT_SMS,
                channel: "sms",
                identity_type: "phone_number",
                canonical_address: "+15559876543",
                normalized_address: "+15559876543",
                display_name: "Org SMS",
                inbound_enabled: true,
                outbound_enabled: true,
                verification_state: "verified",
                status: "active",
                health_status: "healthy",
                capabilities: {},
                provider_resource_ref: null,
                scope: "tenant",
                is_default_for_scope: true,
                legacy_binding_id: null,
                metadata: {},
            },
            {
                id: IDENT_EMAIL,
                org_id: ORG,
                provider_account_id: ACCT_EMAIL,
                channel: "email",
                identity_type: "shared_mailbox",
                canonical_address: "noreply@example.org",
                normalized_address: "noreply@example.org",
                display_name: "Primary Email",
                inbound_enabled: true,
                outbound_enabled: true,
                verification_state: "verified",
                status: "active",
                health_status: "healthy",
                capabilities: {},
                provider_resource_ref: null,
                scope: "tenant",
                is_default_for_scope: true,
                legacy_binding_id: LEGACY_BIND,
                metadata: {},
            },
        ],
        locationBindings: [
            {
                id: "lb-1",
                org_id: ORG,
                identity_id: IDENT_SMS_LOC,
                location_id: LOC,
                channel: "sms",
                priority: 0,
                is_default: true,
                inbound_routing_enabled: true,
                outbound_sending_enabled: true,
                status: "active",
            },
        ],
        grants: [],
        legacyBindings: [
            {
                id: LEGACY_BIND,
                org_id: ORG,
                channel: "email",
                provider: "resend",
                scope: "org",
                location_id: null,
                status: "active",
                is_primary: true,
                secret_ref: "env:RESEND_API_KEY",
                inbound_to_e164: null,
                config: { from_email: "noreply@example.org" },
                display_label: "Legacy email",
            },
        ],
    };
}

describe("resolveSenderIdentity", () => {
    it("selects location default for sms", () => {
        const r = resolveSenderIdentity(baseCtx(), {
            orgId: ORG,
            channel: "sms",
            operatorUserId: USER,
            locationId: LOC,
            operatorHasCommunicationsSend: true,
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.communicationIdentity.id).toBe(IDENT_SMS_LOC);
            expect(r.selectionReason).toBe("location_default");
        }
    });

    it("selects tenant default when no location", () => {
        const r = resolveSenderIdentity(baseCtx(), {
            orgId: ORG,
            channel: "sms",
            operatorUserId: USER,
            locationId: null,
            operatorHasCommunicationsSend: true,
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.communicationIdentity.id).toBe(IDENT_SMS_TENANT);
            expect(r.selectionReason).toBe("tenant_default");
        }
    });

    it("honors explicit authorized override", () => {
        const r = resolveSenderIdentity(baseCtx(), {
            orgId: ORG,
            channel: "email",
            operatorUserId: USER,
            locationId: null,
            requestedIdentityId: IDENT_EMAIL,
            operatorHasCommunicationsSend: true,
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.selectionReason).toBe("explicit_authorized_override");
            expect(r.authorization.overrideUsed).toBe(true);
        }
    });

    it("rejects invalid override", () => {
        const r = resolveSenderIdentity(baseCtx(), {
            orgId: ORG,
            channel: "sms",
            operatorUserId: USER,
            locationId: null,
            requestedIdentityId: IDENT_EMAIL,
            operatorHasCommunicationsSend: true,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.failureCode).toBe(SENDER_FAILURE.OVERRIDE_INVALID);
    });

    it("rejects unauthorized override when grants deny", () => {
        const ctx = baseCtx();
        ctx.grants = [
            {
                id: "g1",
                org_id: ORG,
                identity_id: IDENT_EMAIL,
                user_id: USER,
                can_send: true,
                can_receive: false,
                can_configure: false,
                can_manage: false,
                can_override_default: false,
                can_use_across_locations: false,
                status: "active",
            },
        ];
        const r = resolveSenderIdentity(ctx, {
            orgId: ORG,
            channel: "email",
            operatorUserId: USER,
            locationId: null,
            requestedIdentityId: IDENT_SMS_TENANT,
            operatorHasCommunicationsSend: true,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.failureCode).toBe(SENDER_FAILURE.OVERRIDE_INVALID);
    });

    it("uses legacy compatibility fallback when canonical pool empty but mapped legacy identity exists", () => {
        const ctx = baseCtx();
        ctx.identities = ctx.identities.map((i) => ({
            ...i,
            status: "disabled" as const,
            outbound_enabled: false,
        }));
        const r = resolveSenderIdentity(ctx, {
            orgId: ORG,
            channel: "email",
            operatorUserId: USER,
            locationId: null,
            allowLegacyCompatibilityFallback: true,
            operatorHasCommunicationsSend: true,
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.selectionReason).toBe("legacy_compatibility_fallback");
    });

    it("returns stable failure when no identity available", () => {
        const ctx = baseCtx();
        ctx.identities = [];
        ctx.legacyBindings = [];
        const r = resolveSenderIdentity(ctx, {
            orgId: ORG,
            channel: "sms",
            operatorUserId: USER,
            locationId: null,
            operatorHasCommunicationsSend: true,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.failureCode).toBe(SENDER_FAILURE.NO_ELIGIBLE_IDENTITY);
    });
});

describe("resolveInboundIdentity", () => {
    it("resolves sms identity by normalized destination", () => {
        const r = resolveInboundIdentity(baseCtx(), {
            orgId: ORG,
            channel: "sms",
            providerType: "twilio",
            destinationAddress: "+1 (555) 123-4567",
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.communicationIdentity.id).toBe(IDENT_SMS_LOC);
        }
    });

    it("flags ambiguous multi-location bindings", () => {
        const ctx = baseCtx();
        ctx.locationBindings.push({
            id: "lb-2",
            org_id: ORG,
            identity_id: IDENT_SMS_LOC,
            location_id: "99999999-9999-9999-9999-999999999999",
            channel: "sms",
            priority: 10,
            is_default: false,
            inbound_routing_enabled: true,
            outbound_sending_enabled: true,
            status: "active",
        });
        const r = resolveInboundIdentity(ctx, {
            orgId: ORG,
            channel: "sms",
            providerType: "twilio",
            destinationAddress: "+15551234567",
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.ambiguousLocation).toBe(true);
    });
});
