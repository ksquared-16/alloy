/**
 * Visible Email identity vs hidden ingress destination.
 *
 * The product rule under test: a parent, and the operator who owns the address,
 * see `kelly@workwithalloy.com`. The provider destination mail is administratively
 * routed to is transport metadata and must never reach either of them.
 */

import { describe, expect, it } from "vitest";

import {
    isIngressOnlyAddress,
    resolveVisibleEmailIdentity,
    resolveVisibleReplyIdentity,
    visibleEmailAddress,
} from "@/lib/communications/identity/visibleEmailIdentity";

const VISIBLE = "kelly@workwithalloy.com";
const INGRESS = "a7f3c1@x9k2m4.resend.app";

describe("isIngressOnlyAddress", () => {
    it("recognises a provider ingress destination", () => {
        expect(isIngressOnlyAddress(INGRESS)).toBe(true);
        expect(isIngressOnlyAddress("inbound@abc123.resend.dev")).toBe(true);
    });

    it("does not claim an organization address", () => {
        expect(isIngressOnlyAddress(VISIBLE)).toBe(false);
        expect(isIngressOnlyAddress("families@workwithalloy.com")).toBe(false);
    });

    it("is not fooled by the token appearing in the local part", () => {
        expect(isIngressOnlyAddress("resend.app@workwithalloy.com")).toBe(false);
    });

    it("is nothing for nothing", () => {
        expect(isIngressOnlyAddress(null)).toBe(false);
        expect(isIngressOnlyAddress("not-an-address")).toBe(false);
    });
});

describe("visibleEmailAddress", () => {
    it("passes an organization address through, normalized", () => {
        expect(visibleEmailAddress("  Kelly@WorkWithAlloy.com ")).toBe(VISIBLE);
    });

    it("WITHHOLDS an ingress destination rather than showing it", () => {
        expect(visibleEmailAddress(INGRESS)).toBeNull();
    });
});

describe("resolveVisibleEmailIdentity", () => {
    it("prefers the configured sending identity", () => {
        const identity = resolveVisibleEmailIdentity({
            fromEmail: VISIBLE,
            inboundAddress: "families@workwithalloy.com",
            displayName: "Kelly Kurzman",
        });
        expect(identity).toEqual({
            address: VISIBLE,
            displayName: "Kelly Kurzman",
            formatted: `Kelly Kurzman <${VISIBLE}>`,
        });
    });

    it("falls back to the receiving address when no From is set", () => {
        expect(resolveVisibleEmailIdentity({ inboundAddress: VISIBLE })?.address).toBe(VISIBLE);
    });

    it("formats a bare address when there is no display name", () => {
        expect(resolveVisibleEmailIdentity({ fromEmail: VISIBLE })?.formatted).toBe(VISIBLE);
    });

    it("quotes a display name that needs it", () => {
        expect(
            resolveVisibleEmailIdentity({ fromEmail: VISIBLE, displayName: "Kurzman, Kelly" })?.formatted
        ).toBe(`"Kurzman, Kelly" <${VISIBLE}>`);
    });

    it("degrades to NO identity when only an ingress destination is on file", () => {
        // Showing nothing sends an administrator to the setting. Showing them the
        // transport address teaches them a wrong fact about their own identity.
        expect(resolveVisibleEmailIdentity({ fromEmail: INGRESS, inboundAddress: INGRESS })).toBeNull();
    });

    it("skips a mis-filled From and uses the real receiving identity", () => {
        expect(
            resolveVisibleEmailIdentity({ fromEmail: INGRESS, inboundAddress: VISIBLE })?.address
        ).toBe(VISIBLE);
    });
});

describe("resolveVisibleReplyIdentity", () => {
    it("targets the organization's receiving address", () => {
        expect(resolveVisibleReplyIdentity({ fromEmail: VISIBLE, inboundAddress: VISIBLE })).toBe(VISIBLE);
    });

    it("NEVER targets an ingress destination", () => {
        expect(resolveVisibleReplyIdentity({ fromEmail: VISIBLE, inboundAddress: INGRESS })).toBe(VISIBLE);
    });

    it("is null when nothing visible exists to reply to", () => {
        expect(resolveVisibleReplyIdentity({ fromEmail: INGRESS, inboundAddress: INGRESS })).toBeNull();
    });
});
