/**
 * Tenant ownership first, conversation second — and never the other way round.
 *
 * The cases here are the ones that would let an email cross an organization
 * boundary or merge two unrelated conversations. Ambiguity staying ambiguous is
 * asserted as a RESULT, not treated as a failure.
 */

import { describe, expect, it } from "vitest";

import {
    bindingAcceptsInbound,
    normalizeEmailAddress,
    resolveEmailThread,
    resolveInboundEmailOwnership,
    type InboundEmailBinding,
} from "@/lib/communications/email/inboundEmailRouting";
import {
    correlationCandidates,
    mintOutboundMessageId,
    parseAlloyMessageId,
} from "@/lib/communications/email/emailMessageId";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

function binding(partial: Partial<InboundEmailBinding> = {}): InboundEmailBinding {
    return {
        id: "b1",
        org_id: ORG_A,
        channel: "email",
        provider: "resend",
        status: "active",
        inbound_address: "hello@northwind.example",
        ...partial,
    };
}

describe("tenant ownership of a received email", () => {
    it("resolves the exact receiving address", () => {
        const got = resolveInboundEmailOwnership({
            toAddresses: ["hello@northwind.example"],
            bindings: [binding()],
        });
        expect(got.kind).toBe("owned");
        expect(got.kind === "owned" && got.binding.org_id).toBe(ORG_A);
    });

    it("matches case-insensitively and through a display name", () => {
        const got = resolveInboundEmailOwnership({
            toAddresses: ['"Northwind Front Desk" <Hello@Northwind.Example>'],
            bindings: [binding()],
        });
        expect(got.kind).toBe("owned");
    });

    it("resolves an alias within the same organization", () => {
        const got = resolveInboundEmailOwnership({
            toAddresses: ["billing@northwind.example"],
            bindings: [binding(), binding({ id: "b2", inbound_address: "billing@northwind.example" })],
        });
        expect(got.kind).toBe("owned");
        expect(got.kind === "owned" && got.receivingAddress).toBe("billing@northwind.example");
    });

    it("quarantines an unknown destination rather than guessing from the sender", () => {
        const got = resolveInboundEmailOwnership({
            toAddresses: ["nobody@elsewhere.example"],
            bindings: [binding()],
        });
        expect(got.kind).toBe("no_attributable_org");
    });

    it("quarantines a malformed destination", () => {
        expect(resolveInboundEmailOwnership({ toAddresses: ["not-an-address"], bindings: [binding()] }).kind).toBe(
            "no_attributable_org"
        );
        expect(resolveInboundEmailOwnership({ toAddresses: [], bindings: [binding()] }).kind).toBe(
            "no_attributable_org"
        );
    });

    it("does not deliver into a tenant whose binding is disabled", () => {
        // The address exists in configuration, but receiving is off. Quarantine is
        // recoverable; delivering would put mail in a tenant that has not turned
        // receiving on.
        const got = resolveInboundEmailOwnership({
            toAddresses: ["hello@northwind.example"],
            bindings: [binding({ status: "disabled" })],
        });
        expect(got.kind).toBe("no_attributable_org");
    });

    it("does not deliver into a tenant whose binding is still pending verification", () => {
        const got = resolveInboundEmailOwnership({
            toAddresses: ["hello@northwind.example"],
            bindings: [binding({ status: "pending_verification" })],
        });
        expect(got.kind).toBe("no_attributable_org");
    });

    it("ignores an SMS binding that happens to carry an address", () => {
        const got = resolveInboundEmailOwnership({
            toAddresses: ["hello@northwind.example"],
            bindings: [binding({ channel: "sms" })],
        });
        expect(got.kind).toBe("no_attributable_org");
    });

    it("stays ambiguous when destinations are owned by different organizations", () => {
        // The database prevents one address being claimed twice, so this is an
        // email addressed to two tenants at once. Picking one would be a guess.
        const got = resolveInboundEmailOwnership({
            toAddresses: ["hello@northwind.example", "hello@other.example"],
            bindings: [binding(), binding({ id: "b3", org_id: ORG_B, inbound_address: "hello@other.example" })],
        });
        expect(got.kind).toBe("cross_org_ambiguous");
        expect(got.kind === "cross_org_ambiguous" && got.candidateOrgIds).toEqual([ORG_A, ORG_B].sort());
    });

    it("accepts inbound only for an active email binding with an address", () => {
        expect(bindingAcceptsInbound(binding())).toBe(true);
        expect(bindingAcceptsInbound(binding({ inbound_address: null }))).toBe(false);
        expect(bindingAcceptsInbound(binding({ status: "disabled" }))).toBe(false);
    });

    it("normalizes addresses", () => {
        expect(normalizeEmailAddress("  A@B.Example ")).toBe("a@b.example");
        expect(normalizeEmailAddress("Name <a@b.example>")).toBe("a@b.example");
        expect(normalizeEmailAddress("nope")).toBeNull();
        expect(normalizeEmailAddress(null)).toBeNull();
    });
});

describe("conversation provenance inside the owning tenant", () => {
    it("In-Reply-To resolves the exact thread", () => {
        const got = resolveEmailThread({
            inReplyToThreadIds: ["thread-enrollment"],
            referencesThreadIds: ["thread-billing"],
            endpointCandidateThreadIds: ["thread-billing"],
        });
        expect(got).toEqual({ threadId: "thread-enrollment", method: "in_reply_to", ambiguous: false });
    });

    it("falls back to the nearest References ancestor", () => {
        const got = resolveEmailThread({
            inReplyToThreadIds: [],
            referencesThreadIds: ["thread-near", "thread-far"],
            endpointCandidateThreadIds: ["thread-other"],
        });
        expect(got).toEqual({ threadId: "thread-near", method: "references", ambiguous: false });
    });

    it("falls back to endpoint provenance only when no header of ours resolved", () => {
        const got = resolveEmailThread({
            inReplyToThreadIds: [],
            referencesThreadIds: [],
            endpointCandidateThreadIds: ["thread-only"],
        });
        expect(got).toEqual({ threadId: "thread-only", method: "endpoint_provenance", ambiguous: false });
    });

    it("stays ambiguous when a parent has Enrollment and Billing both open and no usable headers", () => {
        // "Most recent sender email" is exactly the guess the precedence exists to
        // avoid, so neither is chosen.
        const got = resolveEmailThread({
            inReplyToThreadIds: [],
            referencesThreadIds: [],
            endpointCandidateThreadIds: ["thread-enrollment", "thread-billing"],
        });
        expect(got.threadId).toBeNull();
        expect(got.ambiguous).toBe(true);
    });

    it("resolves nothing when there is no evidence at all", () => {
        const got = resolveEmailThread({
            inReplyToThreadIds: [],
            referencesThreadIds: [],
            endpointCandidateThreadIds: [],
        });
        expect(got).toEqual({ threadId: null, method: "none", ambiguous: false });
    });

    it("treats conflicting In-Reply-To evidence as ambiguous rather than picking", () => {
        const got = resolveEmailThread({
            inReplyToThreadIds: ["a", "b"],
            referencesThreadIds: [],
            endpointCandidateThreadIds: [],
        });
        expect(got.threadId).toBeNull();
        expect(got.ambiguous).toBe(true);
    });
});

describe("a Message-ID is conversation evidence, never tenant authority", () => {
    it("a foreign organization's message id contributes no thread", () => {
        // The ingestion service looks candidates up ORG-SCOPED, so a message id
        // belonging to another tenant simply returns nothing — and this is what
        // the resolver then does with that nothing.
        const got = resolveEmailThread({
            inReplyToThreadIds: [], // org-scoped lookup found none
            referencesThreadIds: [],
            endpointCandidateThreadIds: [],
        });
        expect(got.threadId).toBeNull();
        expect(got.method).toBe("none");
    });

    it("a forged Alloy-shaped id yields no candidate at all", () => {
        const uuid = "33333333-3333-4333-8333-333333333333";
        expect(parseAlloyMessageId(`<xxxxxx${uuid}@attacker.example>`)).toBeNull();
        expect(correlationCandidates({ inReplyTo: `<xxxxxx${uuid}@attacker.example>`, references: null })).toEqual([]);
    });
});

describe("conversation history does not depend on today's sending domain", () => {
    const uuid = "44444444-4444-4444-8444-444444444444";

    it("recognises an Alloy Message-ID minted under a domain no longer configured", () => {
        // The invariant: changing the From domain must not retroactively make
        // previously sent Message-IDs unrecognisable. Parsing never consults the
        // domain — only minting does — so a reply quoting an old header still
        // correlates.
        const oldDomain = mintOutboundMessageId({ communicationMessageId: uuid, fromEmail: "desk@old-domain.example" })!;
        const newDomain = mintOutboundMessageId({ communicationMessageId: uuid, fromEmail: "desk@new-domain.example" })!;

        expect(oldDomain).not.toBe(newDomain);
        expect(parseAlloyMessageId(oldDomain)).toBe(uuid);
        expect(parseAlloyMessageId(newDomain)).toBe(uuid);
    });

    it("recognises one minted under a domain that never belonged to this deployment", () => {
        expect(parseAlloyMessageId(`<alloy.${uuid}@anything-at-all.example>`)).toBe(uuid);
    });

    it("still refuses a foreign id regardless of domain", () => {
        expect(parseAlloyMessageId(`<notalloy.${uuid}@old-domain.example>`)).toBeNull();
    });
});
