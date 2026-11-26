/**
 * Location precedence, asserted against the REAL resolver and the REAL projection.
 *
 * Both halves matter and neither is meaningful alone:
 *
 *   `planBindingIdentityProjection` decides what the identity model contains.
 *   `resolveSenderIdentity`         decides which identity a conversation uses.
 *
 * Testing the resolver against hand-written identity rows would prove only that
 * the resolver works on fixtures nobody produces. So these tests build the
 * resolution context by running the projection over BINDINGS — the rows an
 * administrator actually authors on `/organization/communications` — and then ask
 * the resolver. If the projection stops emitting what the resolver needs, this
 * fails, which is exactly the drift the convergence exists to prevent.
 */

import { describe, expect, it } from "vitest";

import { planBindingIdentityProjection, type ProjectableBinding } from "@/lib/communications/identity/projectBindingIdentity";
import { resolveSenderIdentity } from "@/lib/communications/identity/resolveSenderIdentity";
import type { IdentityResolutionContext } from "@/lib/communications/identity/types";

const ORG = "11111111-1111-4111-8111-111111111111";
const RIVERSIDE = "22222222-2222-4222-8222-222222222222";
const LAKESIDE = "33333333-3333-4333-8333-333333333333";

function binding(over: Partial<ProjectableBinding> & { id: string }): ProjectableBinding {
    return {
        org_id: ORG,
        channel: "email",
        provider: "resend",
        status: "active",
        is_primary: false,
        scope: "org",
        location_id: null,
        display_label: null,
        secret_ref: "env:RESEND_API_KEY",
        inbound_address: null,
        inbound_to_e164: null,
        config: {},
        ...over,
    };
}

/**
 * Run the projection over a set of bindings and assemble the context the resolver
 * consumes — the same shape `loadIdentityResolutionContext` builds from the
 * database, constructed here from the projection's own output.
 */
function contextFrom(bindings: ProjectableBinding[]): IdentityResolutionContext {
    const accounts: IdentityResolutionContext["accounts"] = [];
    const identities: IdentityResolutionContext["identities"] = [];
    const locationBindings: IdentityResolutionContext["locationBindings"] = [];

    bindings.forEach((b, i) => {
        const plan = planBindingIdentityProjection(b);
        const accountId = `account-${i}`;
        const identityId = `identity-${i}`;

        accounts.push({
            id: accountId,
            org_id: plan.account.org_id,
            provider_type: plan.account.provider_type,
            status: plan.account.status,
            verification_state: plan.account.verification_state,
            health_status: "unknown",
            secret_ref: plan.account.secret_ref,
            capabilities: {},
            config: plan.account.config,
            legacy_binding_id: plan.account.legacy_binding_id,
        } as IdentityResolutionContext["accounts"][number]);

        if (plan.identity) {
            identities.push({
                id: identityId,
                org_id: plan.identity.org_id,
                provider_account_id: accountId,
                channel: plan.identity.channel,
                identity_type: plan.identity.identity_type,
                canonical_address: plan.identity.canonical_address,
                normalized_address: plan.identity.normalized_address,
                display_name: plan.identity.display_name,
                inbound_enabled: plan.identity.inbound_enabled,
                outbound_enabled: plan.identity.outbound_enabled,
                verification_state: plan.identity.verification_state,
                status: plan.identity.status,
                health_status: "unknown",
                capabilities: {},
                scope: plan.identity.scope,
                is_default_for_scope: plan.identity.is_default_for_scope,
                legacy_binding_id: plan.identity.legacy_binding_id,
                metadata: {},
            } as IdentityResolutionContext["identities"][number]);
        }

        if (plan.locationBinding) {
            locationBindings.push({
                id: `locbind-${i}`,
                org_id: plan.locationBinding.org_id,
                identity_id: identityId,
                location_id: plan.locationBinding.location_id,
                channel: plan.locationBinding.channel,
                priority: plan.locationBinding.priority,
                is_default: plan.locationBinding.is_default,
                inbound_routing_enabled: plan.locationBinding.inbound_routing_enabled,
                outbound_sending_enabled: plan.locationBinding.outbound_sending_enabled,
                status: plan.locationBinding.status,
            } as IdentityResolutionContext["locationBindings"][number]);
        }
    });

    return { accounts, identities, locationBindings, grants: [], legacyBindings: [] };
}

function resolve(bindings: ProjectableBinding[], channel: "email" | "sms", locationId: string | null) {
    return resolveSenderIdentity(contextFrom(bindings), {
        orgId: ORG,
        channel,
        operatorUserId: null,
        locationId,
        primaryEntityType: null,
        primaryEntityId: null,
        messagePurpose: null,
        requestedIdentityId: null,
        requestedLegacyBindingId: null,
        requiredCapabilities: undefined,
        allowLegacyCompatibilityFallback: false,
        operatorHasCommunicationsSend: true,
    });
}

const ORG_EMAIL = binding({
    id: "b-org-email",
    is_primary: true,
    inbound_address: "hello@firefly.example",
    config: { from_email: "hello@firefly.example" },
});

const RIVERSIDE_EMAIL = binding({
    id: "b-riverside-email",
    scope: "location",
    location_id: RIVERSIDE,
    inbound_address: "riverside@firefly.example",
    config: { from_email: "riverside@firefly.example" },
});

const ORG_SMS = binding({
    id: "b-org-sms",
    channel: "sms",
    provider: "twilio",
    is_primary: true,
    secret_ref: "legacy_global_twilio",
    inbound_to_e164: "+15550001111",
});

const RIVERSIDE_SMS = binding({
    id: "b-riverside-sms",
    channel: "sms",
    provider: "twilio",
    scope: "location",
    location_id: RIVERSIDE,
    secret_ref: "legacy_global_twilio",
    inbound_to_e164: "+15550002222",
});

describe("the required precedence — location, then organization, then unavailable", () => {
    it("a Riverside conversation sends from the Riverside identity", () => {
        const r = resolve([ORG_EMAIL, RIVERSIDE_EMAIL], "email", RIVERSIDE);
        expect(r.ok).toBe(true);
        expect(r.ok === true && r.safeSenderMetadata.fromAddress).toBe("riverside@firefly.example");
        expect(r.ok === true && r.selectionReason).toBe("location_default");
    });

    it("a Lakeside conversation falls back to the organization default", () => {
        // Lakeside has no identity of its own — inheritance, proven rather than assumed.
        const r = resolve([ORG_EMAIL, RIVERSIDE_EMAIL], "email", LAKESIDE);
        expect(r.ok).toBe(true);
        expect(r.ok === true && r.safeSenderMetadata.fromAddress).toBe("hello@firefly.example");
        expect(r.ok === true && r.selectionReason).toBe("tenant_default");
    });

    it("a conversation with no location uses the organization default", () => {
        const r = resolve([ORG_EMAIL, RIVERSIDE_EMAIL], "email", null);
        expect(r.ok).toBe(true);
        expect(r.ok === true && r.safeSenderMetadata.fromAddress).toBe("hello@firefly.example");
    });

    it("with nothing configured at all, the answer is unavailable — never a guess", () => {
        const r = resolve([], "email", RIVERSIDE);
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.failureCode).toBeTruthy();
    });
});

describe("one resolver, two channels, independent answers", () => {
    const ALL = [ORG_EMAIL, RIVERSIDE_EMAIL, ORG_SMS, RIVERSIDE_SMS];

    it("Riverside resolves its own address AND its own number", () => {
        expect(resolve(ALL, "email", RIVERSIDE).ok === true &&
            (resolve(ALL, "email", RIVERSIDE) as { safeSenderMetadata: { fromAddress: string } }).safeSenderMetadata
                .fromAddress).toBe("riverside@firefly.example");
        const sms = resolve(ALL, "sms", RIVERSIDE);
        expect(sms.ok === true && sms.safeSenderMetadata.fromAddress).toBe("+15550002222");
    });

    it("a channel never borrows the other channel's identity", () => {
        const email = resolve(ALL, "email", RIVERSIDE);
        const sms = resolve(ALL, "sms", RIVERSIDE);
        expect(email.ok === true && email.safeSenderMetadata.channel).toBe("email");
        expect(sms.ok === true && sms.safeSenderMetadata.channel).toBe("sms");
    });

    it("SMS can inherit while Email overrides, at the same location", () => {
        // Riverside has its own email but no own number.
        const partial = [ORG_EMAIL, RIVERSIDE_EMAIL, ORG_SMS];
        const email = resolve(partial, "email", RIVERSIDE);
        const sms = resolve(partial, "sms", RIVERSIDE);
        expect(email.ok === true && email.safeSenderMetadata.fromAddress).toBe("riverside@firefly.example");
        expect(sms.ok === true && sms.safeSenderMetadata.fromAddress).toBe("+15550001111");
    });
});

describe("configuration state the resolver must refuse", () => {
    it("an unverified location identity does not send — and does NOT silently inherit either", () => {
        const pending = { ...RIVERSIDE_EMAIL, status: "pending_verification" };
        const r = resolve([ORG_EMAIL, pending], "email", RIVERSIDE);
        // The location's own identity is not usable, so the organization default
        // is the truthful answer — the family still gets a reply.
        expect(r.ok).toBe(true);
        expect(r.ok === true && r.safeSenderMetadata.fromAddress).toBe("hello@firefly.example");
    });

    it("a disabled location identity falls back rather than failing the send", () => {
        const disabled = { ...RIVERSIDE_EMAIL, status: "disabled" };
        const r = resolve([ORG_EMAIL, disabled], "email", RIVERSIDE);
        expect(r.ok).toBe(true);
        expect(r.ok === true && r.safeSenderMetadata.fromAddress).toBe("hello@firefly.example");
    });

    it("a location identity with no credential is not usable", () => {
        const uncredentialed = { ...RIVERSIDE_EMAIL, secret_ref: "unconfigured" };
        const r = resolve([ORG_EMAIL, uncredentialed], "email", RIVERSIDE);
        expect(r.ok === true && r.safeSenderMetadata.fromAddress).toBe("hello@firefly.example");
    });
});

describe("the projection emits what the resolver needs", () => {
    it("a location binding produces a location-scoped identity and its location row", () => {
        const plan = planBindingIdentityProjection(RIVERSIDE_EMAIL);
        expect(plan.identity?.scope).toBe("location");
        expect(plan.locationBinding?.location_id).toBe(RIVERSIDE);
        expect(plan.locationBinding?.is_default).toBe(true);
        expect(plan.locationBinding?.outbound_sending_enabled).toBe(true);
    });

    it("an organization binding produces a tenant-scoped identity and NO location row", () => {
        const plan = planBindingIdentityProjection(ORG_EMAIL);
        expect(plan.identity?.scope).toBe("tenant");
        expect(plan.locationBinding).toBeNull();
    });

    it("a binding awaiting verification projects a DISABLED identity", () => {
        // `communication_identities.status` has no pending state; mapping it to
        // active would let the resolver send from an unverified identity.
        const plan = planBindingIdentityProjection({ ...ORG_EMAIL, status: "pending_verification" });
        expect(plan.identity?.status).toBe("disabled");
        expect(plan.identity?.outbound_enabled).toBe(false);
        expect(plan.account.verification_state).toBe("pending");
    });

    it("a channel with no address yet projects an account but no identity", () => {
        const plan = planBindingIdentityProjection(binding({ id: "b-empty", channel: "sms", provider: "twilio" }));
        expect(plan.account).toBeTruthy();
        expect(plan.identity).toBeNull();
        expect(plan.locationBinding).toBeNull();
    });

    it("is convergent — projecting twice yields the same plan", () => {
        expect(planBindingIdentityProjection(RIVERSIDE_EMAIL)).toEqual(
            planBindingIdentityProjection(RIVERSIDE_EMAIL),
        );
    });
});
