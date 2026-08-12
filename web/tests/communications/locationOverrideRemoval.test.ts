/**
 * What "remove the Riverside override" must mean.
 *
 * The product meaning the Director specified:
 *
 *     override exists   → the location uses that identity
 *     remove override   → the location has no override → it INHERITS the
 *                         organization default
 *
 * That is emphatically NOT the same as "mutate the location identity into an
 * organization-scoped one". This file exists because the first implementation did
 * the second thing, and the difference is not cosmetic:
 *
 *   - a location identity broadened to organization scope joins the pool the
 *     resolver draws the organization default from, so an address a school
 *     created for ONE campus can start speaking for the whole organization;
 *   - it changes the resolver's precedence level for that identity;
 *   - and it does it silently, at the moment an administrator thought they were
 *     REMOVING something.
 *
 * The correct semantics — assignment removed, identity and history preserved,
 * inheritance restored — is asserted here against the REAL projection and the
 * REAL resolver, so it cannot be satisfied by a comment.
 */

import { describe, expect, it } from "vitest";

import {
    planBindingIdentityProjection,
    type ProjectableBinding,
} from "@/lib/communications/identity/projectBindingIdentity";
import { resolveSenderIdentity } from "@/lib/communications/identity/resolveSenderIdentity";
import type { IdentityResolutionContext } from "@/lib/communications/identity/types";
import { planLocationOverrideRemoval } from "@/lib/communications/locationOverrideRemoval";

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

function resolve(bindings: ProjectableBinding[], locationId: string | null) {
    return resolveSenderIdentity(contextFrom(bindings), {
        orgId: ORG,
        channel: "email",
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

const ORG_DEFAULT = binding({
    id: "b-org",
    is_primary: true,
    inbound_address: "hello@firefly.example",
    config: { from_email: "hello@firefly.example" },
});

const RIVERSIDE_OVERRIDE = binding({
    id: "b-riverside",
    scope: "location",
    location_id: RIVERSIDE,
    inbound_address: "riverside@firefly.example",
    config: { from_email: "riverside@firefly.example" },
});

describe("before removal — the override is in force", () => {
    it("Riverside sends as Riverside", () => {
        const r = resolve([ORG_DEFAULT, RIVERSIDE_OVERRIDE], RIVERSIDE);
        expect(r.ok === true && r.safeSenderMetadata.fromAddress).toBe("riverside@firefly.example");
    });
});

describe("removing the override restores inheritance", () => {
    const removed = { ...RIVERSIDE_OVERRIDE, ...planLocationOverrideRemoval(RIVERSIDE_OVERRIDE).patch };

    it("Riverside now uses the organization identity", () => {
        const r = resolve([ORG_DEFAULT, removed], RIVERSIDE);
        expect(r.ok).toBe(true);
        expect(r.ok === true && r.safeSenderMetadata.fromAddress).toBe("hello@firefly.example");
    });

    it("the former Riverside identity does NOT become an organization candidate", () => {
        // The heart of it. With the organization default removed as well, the ONLY
        // remaining identity is the ex-Riverside one. If removal had broadened it
        // to organization scope, it would answer here — an address created for one
        // campus silently speaking for the whole school.
        const r = resolve([removed], null);
        expect(r.ok, "an ex-location identity must not answer for the organization").toBe(false);
    });

    it("it does not become the organization default for another location either", () => {
        const r = resolve([removed], LAKESIDE);
        expect(r.ok).toBe(false);
    });

    it("the identity keeps its location — ownership and history are preserved", () => {
        // Removal is about ASSIGNMENT. The identity still belongs to Riverside,
        // which is what keeps it out of the organization pool and keeps the
        // conversation history attributable.
        expect(removed.location_id).toBe(RIVERSIDE);
        expect(planBindingIdentityProjection(removed).identity?.scope).toBe("location");
    });

    it("the receiving address is still claimed by this tenant", () => {
        // Never cleared: clearing it would release a globally-unique address for
        // another organization to claim, and orphan every message that named it.
        expect(removed.inbound_address).toBe("riverside@firefly.example");
    });

    it("no location binding remains active for Riverside", () => {
        const plan = planBindingIdentityProjection(removed);
        // Either no location row at all, or one that is switched off — both mean
        // "Riverside has no override" to the resolver.
        expect(plan.locationBinding === null || plan.locationBinding.status !== "active").toBe(true);
        expect(plan.locationBinding?.outbound_sending_enabled ?? false).toBe(false);
    });
});

describe("removal is reversible and idempotent", () => {
    it("re-assigning restores the override", () => {
        const removed = { ...RIVERSIDE_OVERRIDE, ...planLocationOverrideRemoval(RIVERSIDE_OVERRIDE).patch };
        const reassigned = { ...removed, status: "active" };
        const r = resolve([ORG_DEFAULT, reassigned], RIVERSIDE);
        expect(r.ok === true && r.safeSenderMetadata.fromAddress).toBe("riverside@firefly.example");
    });

    it("removing twice is the same as removing once", () => {
        const once = planLocationOverrideRemoval(RIVERSIDE_OVERRIDE).patch;
        const removed = { ...RIVERSIDE_OVERRIDE, ...once };
        const twice = planLocationOverrideRemoval(removed).patch;
        expect({ ...removed, ...twice }).toEqual(removed);
    });

    it("removal on an organization binding is refused — there is nothing to remove", () => {
        const outcome = planLocationOverrideRemoval(ORG_DEFAULT);
        expect(outcome.ok).toBe(false);
    });
});
