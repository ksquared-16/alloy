/**
 * Ownership when mail arrives at a HIDDEN destination.
 *
 * Under selective routing the organization keeps its own MX. An address-level
 * rule at their mail provider forwards one mailbox onward to an opaque provider
 * destination, and that is the address Resend reports as the delivery target.
 * `inbound_address` — what the parent actually wrote to — appears nowhere in the
 * provider's destination list.
 *
 * So ownership must resolve through the ingress destination, while everything
 * downstream must still see the VISIBLE identity. Those two requirements pull in
 * opposite directions and this file holds both of them down.
 */

import { describe, expect, it } from "vitest";

import {
    bindingAcceptsInbound,
    bindingClaimableDestinations,
    resolveInboundEmailOwnership,
    type InboundEmailBinding,
} from "@/lib/communications/email/inboundEmailRouting";

const ORG_A = "org-a";
const ORG_B = "org-b";
const VISIBLE = "kelly@workwithalloy.com";
const HIDDEN = "a7f3c1@x9k2m4.resend.app";

function binding(overrides: Partial<InboundEmailBinding> = {}): InboundEmailBinding {
    return {
        id: "b1",
        org_id: ORG_A,
        channel: "email",
        provider: "resend",
        status: "active",
        inbound_address: VISIBLE,
        ingress_destinations: [HIDDEN],
        ...overrides,
    };
}

describe("bindingClaimableDestinations", () => {
    it("claims both the visible identity and the routed destination", () => {
        expect(bindingClaimableDestinations(binding())).toEqual([VISIBLE, HIDDEN]);
    });

    it("puts the VISIBLE identity first, so it wins when a message names both", () => {
        // A forwarded copy often still carries the original `To`. Ownership must
        // resolve through the address a human would recognise.
        expect(bindingClaimableDestinations(binding())[0]).toBe(VISIBLE);
    });

    it("normalizes and deduplicates", () => {
        const claimable = bindingClaimableDestinations(
            binding({ ingress_destinations: [` <${HIDDEN.toUpperCase()}> `, HIDDEN] })
        );
        expect(claimable).toEqual([VISIBLE, HIDDEN]);
    });

    it("claims nothing for a binding with neither", () => {
        expect(bindingClaimableDestinations(binding({ inbound_address: null, ingress_destinations: [] }))).toEqual([]);
    });
});

describe("bindingAcceptsInbound", () => {
    it("accepts a binding that only has a routed destination", () => {
        expect(bindingAcceptsInbound(binding({ inbound_address: null }))).toBe(true);
    });

    it("still refuses a binding claiming nothing at all", () => {
        expect(bindingAcceptsInbound(binding({ inbound_address: null, ingress_destinations: [] }))).toBe(false);
    });

    it("still refuses an inactive binding, however it is routed", () => {
        expect(bindingAcceptsInbound(binding({ status: "pending_verification" }))).toBe(false);
        expect(bindingAcceptsInbound(binding({ status: "disabled" }))).toBe(false);
    });
});

describe("resolveInboundEmailOwnership through selective routing", () => {
    it("attributes a message delivered ONLY to the hidden destination", () => {
        // Before ingress routes existed this quarantined as unattributable —
        // every message under selective routing, in the tenant that owns it.
        const owned = resolveInboundEmailOwnership({
            toAddresses: [HIDDEN],
            bindings: [binding()],
        });
        expect(owned.kind).toBe("owned");
    });

    it("reports the VISIBLE identity as the receiving address, never the destination", () => {
        // `receivingAddress` becomes a thread endpoint and is compared against
        // outbound `from_address`. Reporting the transport address would split
        // the conversation AND write the hidden address into canonical history.
        const owned = resolveInboundEmailOwnership({
            toAddresses: [HIDDEN],
            bindings: [binding()],
        });
        expect(owned.kind === "owned" && owned.receivingAddress).toBe(VISIBLE);
    });

    it("still attributes direct delivery to the visible address", () => {
        const owned = resolveInboundEmailOwnership({
            toAddresses: [VISIBLE],
            bindings: [binding({ ingress_destinations: [] })],
        });
        expect(owned.kind === "owned" && owned.receivingAddress).toBe(VISIBLE);
    });

    it("uses the routed destination as the receiving address when there is no visible identity", () => {
        const owned = resolveInboundEmailOwnership({
            toAddresses: [HIDDEN],
            bindings: [binding({ inbound_address: null })],
        });
        expect(owned.kind === "owned" && owned.receivingAddress).toBe(HIDDEN);
    });

    it("does NOT let a routed destination pull a message across a tenant boundary", () => {
        // Two organizations, each claiming one of the two addresses on the same
        // message. That is genuinely ambiguous and is never resolved by picking.
        const ambiguous = resolveInboundEmailOwnership({
            toAddresses: [VISIBLE, HIDDEN],
            bindings: [
                binding({ id: "b1", org_id: ORG_A, inbound_address: VISIBLE, ingress_destinations: [] }),
                binding({ id: "b2", org_id: ORG_B, inbound_address: null, ingress_destinations: [HIDDEN] }),
            ],
        });
        expect(ambiguous.kind).toBe("cross_org_ambiguous");
    });

    it("is not ambiguous when both addresses belong to the SAME binding", () => {
        // The forwarded-copy case: original `To` plus the destination it was
        // routed to. One tenant, one conversation.
        const owned = resolveInboundEmailOwnership({
            toAddresses: [VISIBLE, HIDDEN],
            bindings: [binding()],
        });
        expect(owned.kind).toBe("owned");
        expect(owned.kind === "owned" && owned.receivingAddress).toBe(VISIBLE);
    });

    it("still quarantines a destination nobody claims", () => {
        const orphan = resolveInboundEmailOwnership({
            toAddresses: ["nobody@zz99.resend.app"],
            bindings: [binding()],
        });
        expect(orphan.kind).toBe("no_attributable_org");
    });
});
