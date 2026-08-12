/**
 * Who may send in which conversation.
 *
 * Every persona the Director named is here. The property that matters most is the
 * one asserted last: authorization NEVER changes which identity is used. A
 * Riverside conversation sends from Riverside's address whoever is typing — the
 * permission layer decides only whether the typing is allowed at all.
 */

import { describe, expect, it } from "vitest";

import { decideCommunicationsSendScope } from "@/lib/communications/communicationsSendScope";

const RIVERSIDE = "22222222-2222-4222-8222-222222222222";
const LAKESIDE = "33333333-3333-4333-8333-333333333333";

/** An organization-wide Communications admin — unrestricted by site. */
const orgAdmin = { hasCommunicationsSend: true, siteScope: "all" as const, allowedSiteLocationIds: null };
/** An operator who may only act at Riverside. */
const riversideOperator = {
    hasCommunicationsSend: true,
    siteScope: "restricted" as const,
    allowedSiteLocationIds: [RIVERSIDE],
};
/** An operator who may only act at Lakeside. */
const lakesideOperator = {
    hasCommunicationsSend: true,
    siteScope: "restricted" as const,
    allowedSiteLocationIds: [LAKESIDE],
};

describe("organization-wide Communications admin", () => {
    it("may answer any location", () => {
        expect(decideCommunicationsSendScope({ ...orgAdmin, conversationLocationId: RIVERSIDE }).allowed).toBe(true);
        expect(decideCommunicationsSendScope({ ...orgAdmin, conversationLocationId: LAKESIDE }).allowed).toBe(true);
    });

    it("may answer the organization conversation", () => {
        expect(decideCommunicationsSendScope({ ...orgAdmin, conversationLocationId: null }).allowed).toBe(true);
    });
});

describe("a site-restricted operator", () => {
    it("may answer their own location", () => {
        const d = decideCommunicationsSendScope({ ...riversideOperator, conversationLocationId: RIVERSIDE });
        expect(d.allowed).toBe(true);
        expect(d.allowed === true && d.reason).toBe("site_permitted");
    });

    it("may NOT answer another location — the boundary this exists for", () => {
        const d = decideCommunicationsSendScope({ ...riversideOperator, conversationLocationId: LAKESIDE });
        expect(d.allowed).toBe(false);
        expect(d.allowed === false && d.reason).toBe("location_not_permitted");
    });

    it("and the reverse operator is refused symmetrically", () => {
        expect(
            decideCommunicationsSendScope({ ...lakesideOperator, conversationLocationId: RIVERSIDE }).allowed,
        ).toBe(false);
        expect(decideCommunicationsSendScope({ ...lakesideOperator, conversationLocationId: LAKESIDE }).allowed).toBe(
            true,
        );
    });

    it("may answer the ORGANIZATION conversation — no location boundary is crossed", () => {
        // A judgment call, recorded in the module: an organization conversation has
        // no location, so there is nothing to be excluded from. Denying would make
        // the general inbox — where unknown senders land — admin-only.
        const d = decideCommunicationsSendScope({ ...riversideOperator, conversationLocationId: null });
        expect(d.allowed).toBe(true);
        expect(d.allowed === true && d.reason).toBe("organization_conversation");
    });
});

describe("permission is required before location is even considered", () => {
    it("site access without communications.send is refused", () => {
        const d = decideCommunicationsSendScope({
            hasCommunicationsSend: false,
            siteScope: "all",
            allowedSiteLocationIds: null,
            conversationLocationId: RIVERSIDE,
        });
        expect(d.allowed).toBe(false);
        expect(d.allowed === false && d.reason).toBe("no_send_permission");
    });

    it("the refusal says nothing about the conversation or its location", () => {
        const d = decideCommunicationsSendScope({
            hasCommunicationsSend: false,
            siteScope: "restricted",
            allowedSiteLocationIds: [LAKESIDE],
            conversationLocationId: RIVERSIDE,
        });
        expect(d.allowed === false && d.message).not.toContain("location");
    });

    it("communications.send WITHOUT access to the conversation's location is refused", () => {
        const d = decideCommunicationsSendScope({ ...riversideOperator, conversationLocationId: LAKESIDE });
        expect(d.allowed).toBe(false);
    });
});

describe("restriction must fail closed", () => {
    it("restricted with an EMPTY allow-list permits nothing", () => {
        // The inversion to avoid: reading "no entries" as "no restriction".
        const d = decideCommunicationsSendScope({
            hasCommunicationsSend: true,
            siteScope: "restricted",
            allowedSiteLocationIds: [],
            conversationLocationId: RIVERSIDE,
        });
        expect(d.allowed).toBe(false);
    });

    it("restricted with a NULL allow-list permits nothing either", () => {
        const d = decideCommunicationsSendScope({
            hasCommunicationsSend: true,
            siteScope: "restricted",
            allowedSiteLocationIds: null,
            conversationLocationId: RIVERSIDE,
        });
        expect(d.allowed).toBe(false);
    });

    it("whitespace and blank ids never match a real location", () => {
        const d = decideCommunicationsSendScope({
            hasCommunicationsSend: true,
            siteScope: "restricted",
            allowedSiteLocationIds: ["  ", ""],
            conversationLocationId: RIVERSIDE,
        });
        expect(d.allowed).toBe(false);
    });
});

describe("the decision never leaks another tenant's or location's detail", () => {
    it("messages name no address, identity, or other location", () => {
        const refusals = [
            decideCommunicationsSendScope({ ...riversideOperator, conversationLocationId: LAKESIDE }),
            decideCommunicationsSendScope({
                hasCommunicationsSend: false,
                siteScope: "all",
                allowedSiteLocationIds: null,
                conversationLocationId: RIVERSIDE,
            }),
        ];
        for (const r of refusals) {
            expect(r.allowed).toBe(false);
            const message = r.allowed === false ? r.message : "";
            expect(message).not.toContain(RIVERSIDE);
            expect(message).not.toContain(LAKESIDE);
            expect(message).not.toContain("@");
        }
    });
});

describe("authorization is independent of identity resolution", () => {
    it("the decision is a boolean about the ACTOR, carrying no identity information", () => {
        // The shape itself is the guarantee: there is nowhere for an identity, an
        // address, or a credential to travel. An authorized Riverside reply goes
        // out from Riverside's address because the CONVERSATION says so, never
        // because of who the operator is.
        const d = decideCommunicationsSendScope({ ...riversideOperator, conversationLocationId: RIVERSIDE });
        expect(Object.keys(d).sort()).toEqual(["allowed", "reason"]);
    });

    it("both channels are governed identically — there is no channel input at all", () => {
        // Email and SMS cannot diverge here, because this layer never sees the
        // channel. Any per-channel permission difference would have to be a
        // deliberate future addition rather than an accident.
        const d = decideCommunicationsSendScope({ ...riversideOperator, conversationLocationId: RIVERSIDE });
        expect(JSON.stringify(d)).not.toContain("email");
        expect(JSON.stringify(d)).not.toContain("sms");
    });
});
