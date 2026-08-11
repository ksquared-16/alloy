import { describe, expect, it } from "vitest";

import {
    deriveInboxThreadRoutingState,
    maskInboxEndpointForDisplay,
    routingAmbiguityNotice,
    unidentifiedSenderDisplayName,
} from "@/lib/communications/inboxThreadRoutingState";
import { resolveInboxReplyTarget } from "@/lib/communications/inboxThreadIdentity";
import type { InboxThreadListItem } from "@/lib/communications/inboxThreadTypes";

const THREAD_ID = "aaaaaaaa-0000-0000-0000-00000000000a";
const PERSON = "33333333-3333-3333-3333-333333333333";

function thread(partial: Partial<InboxThreadListItem>): InboxThreadListItem {
    return {
        id: THREAD_ID,
        org_id: "org",
        channel: "sms",
        recipient_key: "+15551230001",
        primary_entity_type: "persons",
        primary_entity_id: PERSON,
        created_at: null,
        updated_at: null,
        last_message_at: null,
        archived_at: null,
        is_archived: false,
        sort_at: null,
        contact_display: "Jordan Smith",
        family_display: null,
        location_display: null,
        status_display: null,
        related_children_display: null,
        related_contacts_display: null,
        context_display: null,
        channel_contact_display: null,
        preview_lead: null,
        reply_person_id: PERSON,
        reply_email_available: false,
        reply_sms_available: true,
        can_reply: true,
        sender_identity_state: "identified",
        routing_state: "routed",
        routing_candidate_count: 0,
        routing_notice: null,
        reply_authority: "person",
        reply_display_label: null,
        entity_chip: null,
        last_message_preview: null,
        has_unread: false,
        ...partial,
    };
}

describe("deriveInboxThreadRoutingState", () => {
    it("treats a person anchor as identified and routed", () => {
        expect(
            deriveInboxThreadRoutingState({
                primaryEntityType: "persons",
                attentionState: "needs_response",
                metadata: { inbound_resolution: "single_person_match" },
            })
        ).toEqual({ senderIdentityState: "identified", routingState: "routed", routingCandidateCount: 0 });
    });

    it("treats the surrogate anchor as unidentified", () => {
        const r = deriveInboxThreadRoutingState({
            primaryEntityType: "communications_unknown",
            attentionState: "needs_response",
            metadata: { inbound_resolution: "unknown_sender" },
        });
        expect(r.senderIdentityState).toBe("unidentified");
        // Unknown is not ambiguous: nothing for the operator to choose between.
        expect(r.routingState).toBe("routed");
    });

    it("counts candidates when the resolver called it ambiguous", () => {
        const r = deriveInboxThreadRoutingState({
            primaryEntityType: "communications_unknown",
            attentionState: "needs_routing_resolution",
            metadata: { inbound_resolution: "ambiguous_sender", candidate_person_ids: ["a", "b", "c"] },
        });
        expect(r.routingState).toBe("needs_routing_resolution");
        expect(r.routingCandidateCount).toBe(3);
    });

    it("still reports ambiguity when an operator cleared the attention state", () => {
        // Triage moves the queue posture. It does not make two people stop
        // sharing a phone number, so the resolver's conclusion still stands.
        const r = deriveInboxThreadRoutingState({
            primaryEntityType: "communications_unknown",
            attentionState: "needs_response",
            metadata: { inbound_resolution: "ambiguous_sender", candidate_person_ids: ["a", "b"] },
        });
        expect(r.routingState).toBe("needs_routing_resolution");
    });

    it("still reports ambiguity from the attention state when metadata is absent", () => {
        const r = deriveInboxThreadRoutingState({
            primaryEntityType: "communications_unknown",
            attentionState: "needs_routing_resolution",
            metadata: null,
        });
        expect(r.routingState).toBe("needs_routing_resolution");
        expect(r.routingCandidateCount).toBe(0);
    });
});

describe("maskInboxEndpointForDisplay", () => {
    it("reduces a phone number to its last four digits", () => {
        expect(maskInboxEndpointForDisplay("+15551230001", "sms")).toBe("ending in 0001");
        expect(maskInboxEndpointForDisplay("(555) 123-0001", "sms")).toBe("ending in 0001");
    });

    it("reduces an email to its domain", () => {
        expect(maskInboxEndpointForDisplay("parent@example.com", "email")).toBe("at example.com");
    });

    it("returns nothing for placeholder keys", () => {
        expect(maskInboxEndpointForDisplay("_empty", "sms")).toBeNull();
        expect(maskInboxEndpointForDisplay(null, "sms")).toBeNull();
        expect(maskInboxEndpointForDisplay("", "email")).toBeNull();
    });
});

describe("operator-facing language", () => {
    it("says the sender is unidentified without inventing one", () => {
        expect(unidentifiedSenderDisplayName("ending in 0001")).toBe("Unidentified sender · ending in 0001");
        expect(unidentifiedSenderDisplayName(null)).toBe("Unidentified sender");
    });

    it("explains ambiguity without ids or enum names", () => {
        const notice = routingAmbiguityNotice({
            senderIdentityState: "unidentified",
            routingState: "needs_routing_resolution",
            routingCandidateCount: 2,
        })!;
        expect(notice).toContain("2 people");
        expect(notice).not.toContain("_");
    });

    it("says nothing when routing was never in doubt", () => {
        expect(
            routingAmbiguityNotice({
                senderIdentityState: "identified",
                routingState: "routed",
                routingCandidateCount: 0,
            })
        ).toBeNull();
    });
});

describe("resolveInboxReplyTarget — authority selection", () => {
    it("uses person authority for an identified sender", () => {
        const t = resolveInboxReplyTarget(thread({}));
        expect(t.authority).toBe("person");
        expect(t.recipientPersonId).toBe(PERSON);
        expect(t.threadId).toBeNull();
    });

    it("uses thread authority for an unidentified sender", () => {
        const t = resolveInboxReplyTarget(
            thread({
                sender_identity_state: "unidentified",
                primary_entity_type: "communications_unknown",
                primary_entity_id: "surrogate",
                reply_person_id: null,
            })
        );
        expect(t.authority).toBe("thread");
        expect(t.threadId).toBe(THREAD_ID);
        expect(t.recipientPersonId).toBeNull();
        expect(t.displayLabel).toBe("ending in 0001");
    });

    it("refuses to switch an unidentified conversation to another channel", () => {
        // There is no second endpoint for this sender — the only address Alloy
        // has is the one that wrote in.
        const t = resolveInboxReplyTarget(
            thread({
                channel: "sms",
                sender_identity_state: "unidentified",
                primary_entity_type: "communications_unknown",
                reply_person_id: null,
            }),
            "email"
        );
        expect(t.canReply).toBe(false);
        expect(t.authority).toBe("none");
    });

    it("refuses rather than falling back to the address when a person thread has no person", () => {
        const t = resolveInboxReplyTarget(
            thread({ reply_person_id: null, primary_entity_type: "opportunities", primary_entity_id: THREAD_ID })
        );
        expect(t.canReply).toBe(false);
        expect(t.authority).toBe("none");
    });

    it("exposes no address field at all", () => {
        const t = resolveInboxReplyTarget(thread({}));
        expect(Object.keys(t)).not.toContain("toAddress");
        expect(JSON.stringify(t)).not.toContain("+1555");
    });
});
