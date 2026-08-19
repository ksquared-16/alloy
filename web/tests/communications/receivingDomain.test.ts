/**
 * Receiving-domain validation and hidden-destination derivation.
 *
 * The provider contract this encodes was VERIFIED against Resend's current
 * documentation rather than assumed: there is no API that creates an inbound
 * address, every local part at a receiving domain already works, and the default
 * `<id>.resend.app` domain is not exposed by any API. So Alloy derives; it never
 * provisions.
 */

import { describe, expect, it } from "vitest";

import {
    composeIngressDestination,
    extractReceivingDomains,
    mintIngressLocalPart,
    validateReceivingDomain,
} from "@/lib/communications/ingress/receivingDomain";

describe("validateReceivingDomain", () => {
    it("accepts a Resend-assigned default domain and names its source", () => {
        expect(validateReceivingDomain("cool-hedgehog.resend.app")).toEqual({
            ok: true,
            domain: "cool-hedgehog.resend.app",
            source: "resend_default",
        });
    });

    it("accepts a custom receiving domain", () => {
        expect(validateReceivingDomain("inbound.example.com")).toEqual({
            ok: true,
            domain: "inbound.example.com",
            source: "custom_domain",
        });
    });

    it("normalizes case and surrounding whitespace", () => {
        expect(validateReceivingDomain("  Cool-Hedgehog.Resend.App ")).toMatchObject({
            ok: true,
            domain: "cool-hedgehog.resend.app",
        });
    });

    it("REFUSES a full address — the likeliest paste mistake", () => {
        // The dashboard shows `anything@<id>.resend.app`, so pasting the whole
        // thing is the natural error. It gets its own reason so the UI can say
        // something useful instead of "invalid".
        expect(validateReceivingDomain("anything@cool-hedgehog.resend.app")).toEqual({
            ok: false,
            reason: "looks_like_an_address",
        });
    });

    it("refuses empty, single labels, and junk", () => {
        expect(validateReceivingDomain("")).toEqual({ ok: false, reason: "empty" });
        expect(validateReceivingDomain("   ")).toEqual({ ok: false, reason: "empty" });
        expect(validateReceivingDomain("localhost")).toEqual({ ok: false, reason: "not_a_domain" });
        expect(validateReceivingDomain("https://cool.resend.app")).toEqual({ ok: false, reason: "malformed" });
        expect(validateReceivingDomain("cool hedgehog.resend.app")).toEqual({ ok: false, reason: "malformed" });
    });

    it("refuses malformed label boundaries", () => {
        expect(validateReceivingDomain("-bad.resend.app")).toEqual({ ok: false, reason: "not_a_domain" });
        expect(validateReceivingDomain("bad-.resend.app")).toEqual({ ok: false, reason: "not_a_domain" });
        expect(validateReceivingDomain(".resend.app")).toEqual({ ok: false, reason: "not_a_domain" });
        expect(validateReceivingDomain("trailing.dot.")).toEqual({ ok: false, reason: "not_a_domain" });
    });
});

describe("extractReceivingDomains", () => {
    const body = {
        object: "list",
        data: [
            { name: "sending-only.example.com", capabilities: { sending: "enabled", receiving: "disabled" } },
            { name: "inbound.example.com", capabilities: { sending: "enabled", receiving: "enabled" } },
            { name: "second-inbound.example.com", capabilities: { receiving: "enabled" } },
        ],
    };

    it("returns only receiving-ENABLED domains", () => {
        expect(extractReceivingDomains(body)).toEqual(["inbound.example.com", "second-inbound.example.com"]);
    });

    it("never offers a send-only domain — routing to it would deliver nowhere", () => {
        expect(extractReceivingDomains(body)).not.toContain("sending-only.example.com");
    });

    it("is empty rather than throwing on an unreadable payload", () => {
        // Empty means "could not discover", which falls back to the paste path.
        // It must never be read as "this account has no receiving domain".
        expect(extractReceivingDomains(null)).toEqual([]);
        expect(extractReceivingDomains({ unexpected: true })).toEqual([]);
        expect(extractReceivingDomains({ data: [null, 3, "x"] })).toEqual([]);
    });

    it("accepts a bare array as well as a wrapped list", () => {
        expect(extractReceivingDomains([{ name: "a.example.com", capabilities: { receiving: "enabled" } }])).toEqual([
            "a.example.com",
        ]);
    });

    it("deduplicates and lowercases", () => {
        expect(
            extractReceivingDomains({
                data: [
                    { name: "Inbound.Example.com", capabilities: { receiving: "enabled" } },
                    { name: "inbound.example.com", capabilities: { receiving: "enabled" } },
                ],
            })
        ).toEqual(["inbound.example.com"]);
    });
});

describe("mintIngressLocalPart", () => {
    it("is opaque — no identity leaks into transport", () => {
        const local = mintIngressLocalPart();
        expect(local).toMatch(/^[a-z0-9]+$/);
        expect(local).not.toContain("kelly");
    });

    it("is long enough to be unguessable", () => {
        expect(mintIngressLocalPart().length).toBeGreaterThanOrEqual(16);
    });

    it("differs every time — two identities never share a destination", () => {
        const seen = new Set(Array.from({ length: 50 }, () => mintIngressLocalPart()));
        expect(seen.size).toBe(50);
    });
});

describe("composeIngressDestination", () => {
    it("joins local part and domain, normalized", () => {
        expect(composeIngressDestination("A1B2C3", "Cool-Hedgehog.Resend.App")).toBe(
            "a1b2c3@cool-hedgehog.resend.app"
        );
    });
});
