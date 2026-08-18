/**
 * Idempotence and drift for hidden-destination setup.
 *
 * The failure this guards against is not a duplicate row — it is a duplicate
 * ADDRESS. An administrator who already created a forwarding rule against
 * destination A, and is then shown a freshly minted destination B, has a rule
 * pointing at an address Alloy no longer watches. Mail arrives nowhere while
 * everything on screen looks correct.
 */

import { describe, expect, it } from "vitest";

import {
    decideProvisioning,
    describeDomainDrift,
} from "@/lib/communications/ingress/provisionIngressRoute";

const DOMAIN = "cool-hedgehog.resend.app";

describe("decideProvisioning", () => {
    it("creates a destination at the account's receiving domain", () => {
        const decision = decideProvisioning({
            receivingDomain: DOMAIN,
            existing: null,
            mintLocalPart: () => "abc123opaque",
        });
        expect(decision).toEqual({ action: "create", destination: `abc123opaque@${DOMAIN}` });
    });

    it("REUSES an existing route — pressing setup twice is not two addresses", () => {
        const decision = decideProvisioning({
            receivingDomain: DOMAIN,
            existing: { id: "r1", destination: `existing@${DOMAIN}`, last_inbound_at: null },
            mintLocalPart: () => "should-not-be-used",
        });
        expect(decision).toEqual({ action: "reuse", destination: `existing@${DOMAIN}`, routeId: "r1" });
    });

    it("reuses even when the account's receiving domain has since changed", () => {
        // Reminting here would orphan the administrator's existing forwarding
        // rule and every message already correlated through the old address.
        const decision = decideProvisioning({
            receivingDomain: "new-domain.example.com",
            existing: { id: "r1", destination: `existing@${DOMAIN}`, last_inbound_at: "2026-08-18T00:00:00Z" },
        });
        expect(decision).toEqual({ action: "reuse", destination: `existing@${DOMAIN}`, routeId: "r1" });
    });

    it("asks for a receiving domain when the account has none", () => {
        expect(decideProvisioning({ receivingDomain: null, existing: null })).toEqual({
            action: "needs_receiving_domain",
        });
        expect(decideProvisioning({ receivingDomain: "   ", existing: null })).toEqual({
            action: "needs_receiving_domain",
        });
    });

    it("mints a different destination for a second identity on the same domain", () => {
        const a = decideProvisioning({ receivingDomain: DOMAIN, existing: null, mintLocalPart: () => "aaa" });
        const b = decideProvisioning({ receivingDomain: DOMAIN, existing: null, mintLocalPart: () => "bbb" });
        expect(a).not.toEqual(b);
        expect(a.action === "create" && a.destination).toBe(`aaa@${DOMAIN}`);
        expect(b.action === "create" && b.destination).toBe(`bbb@${DOMAIN}`);
    });
});

describe("describeDomainDrift", () => {
    it("reports no drift when the route matches the account", () => {
        expect(describeDomainDrift(`x@${DOMAIN}`, DOMAIN)).toEqual({ drifted: false });
    });

    it("reports drift WITHOUT repairing it", () => {
        expect(describeDomainDrift(`x@${DOMAIN}`, "new.example.com")).toEqual({
            drifted: true,
            routeDomain: DOMAIN,
            accountDomain: "new.example.com",
        });
    });

    it("is quiet when either side is missing", () => {
        expect(describeDomainDrift(null, DOMAIN)).toEqual({ drifted: false });
        expect(describeDomainDrift(`x@${DOMAIN}`, null)).toEqual({ drifted: false });
        expect(describeDomainDrift("not-an-address", DOMAIN)).toEqual({ drifted: false });
    });
});
