/**
 * The queue's grain: one row per PARTY, threads underneath.
 *
 * The observed defect: a family holding three email subjects and one SMS thread
 * rendered four rows, each reading `Kurzman Family`, with nothing to tell them
 * apart. They were never duplicates in storage — deduplication could not have
 * removed them. The grain was wrong.
 *
 * The risk this change introduces, and what most of this file guards: rolling up
 * too far. Merging two families, or absorbing an unresolved sender into a
 * household by endpoint coincidence, would be worse than the duplicate rows.
 */

import { describe, expect, it } from "vitest";

import {
    buildCommunicationHubs,
    findHubForConversation,
    hubConversationsForChannel,
    hubKeyFor,
} from "@/lib/communications/v2/communicationHubProjection";
import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";

const KURZMAN = "cust-kurzman";
const OTHER_FAMILY = "cust-nguyen";

function conv(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
    return {
        id: "t1",
        channel: "email",
        scope_status: "resolved",
        customer_id: KURZMAN,
        family_label: "Kurzman Family",
        topic_label: "Tour availability",
        last_activity_at: "2026-08-14T10:00:00.000Z",
        unread: 0,
        ...overrides,
    } as ConversationSummary;
}

describe("one family is one row, however many threads it holds", () => {
    const rows = [
        conv({ id: "e1", topic_label: "Tour availability", last_activity_at: "2026-08-14T10:00:00.000Z" }),
        conv({ id: "e2", topic_label: "Enrollment paperwork", last_activity_at: "2026-08-12T10:00:00.000Z" }),
        conv({ id: "e3", topic_label: "Tuition question", last_activity_at: "2026-08-10T10:00:00.000Z" }),
        conv({ id: "s1", channel: "sms", topic_label: "General", last_activity_at: "2026-08-13T10:00:00.000Z" }),
    ];

    it("rolls four threads into ONE hub", () => {
        const hubs = buildCommunicationHubs(rows);
        expect(hubs).toHaveLength(1);
        expect(hubs[0]!.label).toBe("Kurzman Family");
    });

    it("keeps every canonical thread underneath — nothing is discarded", () => {
        const [hub] = buildCommunicationHubs(rows);
        expect(hub!.threadIds.sort()).toEqual(["e1", "e2", "e3", "s1"]);
    });

    it("orders children by newest activity", () => {
        const [hub] = buildCommunicationHubs(rows);
        expect(hub!.threadIds).toEqual(["e1", "s1", "e2", "e3"]);
    });

    it("reports both channels it actually holds", () => {
        const [hub] = buildCommunicationHubs(rows);
        expect(hub!.channels.sort()).toEqual(["email", "sms"]);
    });

    it("orders the hub on the newest activity ANYWHERE underneath", () => {
        const [hub] = buildCommunicationHubs(rows);
        expect(hub!.lastActivityAt).toBe("2026-08-14T10:00:00.000Z");
    });
});

describe("aggregation does not double-count", () => {
    it("sums unread across distinct threads", () => {
        const hubs = buildCommunicationHubs([
            conv({ id: "e1", unread: 2 }),
            conv({ id: "e2", unread: 3 }),
            conv({ id: "s1", channel: "sms", unread: 1 }),
        ]);
        expect(hubs[0]!.unread).toBe(6);
    });

    it("counts a thread ONCE even if the same row arrives twice", () => {
        // Two projections of one thread must not become two unread badges.
        const hubs = buildCommunicationHubs([conv({ id: "e1", unread: 4 }), conv({ id: "e1", unread: 4 })]);
        expect(hubs[0]!.unread).toBe(4);
        expect(hubs[0]!.threadIds).toEqual(["e1"]);
    });

    it("prefers the newer row when one thread arrives twice", () => {
        const hubs = buildCommunicationHubs([
            conv({ id: "e1", unread: 1, last_activity_at: "2026-08-10T00:00:00.000Z" }),
            conv({ id: "e1", unread: 9, last_activity_at: "2026-08-14T00:00:00.000Z" }),
        ]);
        expect(hubs[0]!.unread).toBe(9);
    });

    it("counts Needs reply from both the inbound-written and operator-set states", () => {
        const hubs = buildCommunicationHubs([
            conv({ id: "e1", attention_state: "needs_response" }),
            conv({ id: "e2", attention_state: "awaiting_parent_reply" }),
            conv({ id: "e3", attention_state: "resolved" }),
        ]);
        expect(hubs[0]!.needsReplyCount).toBe(2);
    });

    it("counts Needs review for conversations with no operational classification", () => {
        const hubs = buildCommunicationHubs([
            conv({ id: "e1", attention_state: null }),
            conv({ id: "e2", attention_state: "needs_follow_up" }),
        ]);
        expect(hubs[0]!.needsReviewCount).toBe(1);
    });
});

describe("roll-up NEVER merges parties that are not one party", () => {
    it("keeps two families apart", () => {
        const hubs = buildCommunicationHubs([
            conv({ id: "a", customer_id: KURZMAN, family_label: "Kurzman Family" }),
            conv({ id: "b", customer_id: OTHER_FAMILY, family_label: "Nguyen Family" }),
        ]);
        expect(hubs).toHaveLength(2);
    });

    it("keeps an UNRESOLVED conversation out of any family", () => {
        // The single most dangerous thing this projection could do.
        const hubs = buildCommunicationHubs([
            conv({ id: "a", customer_id: KURZMAN }),
            conv({
                id: "u1",
                scope_status: "unresolved",
                customer_id: null,
                family_label: null,
                recipient_key: "stranger@example.invalid",
            }),
        ]);
        expect(hubs).toHaveLength(2);
        const unresolved = hubs.find((h) => h.kind === "unresolved");
        expect(unresolved?.threadIds).toEqual(["u1"]);
    });

    it("does NOT merge two unresolved conversations sharing an endpoint", () => {
        // A shared address is not evidence of one party. Alloy does not know they
        // are the same person, and guessing here is exactly what the scope
        // resolver already declined to do.
        const hubs = buildCommunicationHubs([
            conv({ id: "u1", scope_status: "unresolved", customer_id: null, recipient_key: "shared@example.invalid" }),
            conv({ id: "u2", scope_status: "unresolved", customer_id: null, recipient_key: "shared@example.invalid" }),
        ]);
        expect(hubs).toHaveLength(2);
    });

    it("does NOT merge an AMBIGUOUS conversation into the family it might belong to", () => {
        const hubs = buildCommunicationHubs([
            conv({ id: "a", customer_id: KURZMAN }),
            conv({ id: "amb", scope_status: "ambiguous", customer_id: KURZMAN }),
        ]);
        expect(hubs).toHaveLength(2);
    });

    it("does not group a family and a standalone person together", () => {
        const hubs = buildCommunicationHubs([
            conv({ id: "a", customer_id: KURZMAN }),
            conv({
                id: "p1",
                customer_id: null,
                family_label: null,
                primary_entity_type: "persons",
                primary_entity_id: "person-9",
                primary_contact_name: "Kelly Kurzman",
            }),
        ]);
        expect(hubs).toHaveLength(2);
        expect(hubs.find((h) => h.kind === "person")?.label).toBe("Kelly Kurzman");
    });
});

describe("hubKeyFor", () => {
    it("keys a resolved household on its customer id", () => {
        expect(hubKeyFor(conv())).toEqual({ key: `family:${KURZMAN}`, kind: "family" });
    });

    it("keys a resolved standalone person on the person", () => {
        expect(
            hubKeyFor(
                conv({ customer_id: null, primary_entity_type: "persons", primary_entity_id: "person-9" })
            )
        ).toEqual({ key: "person:person-9", kind: "person" });
    });

    it("keys anything unresolved on its own thread", () => {
        expect(hubKeyFor(conv({ id: "u1", scope_status: "unresolved", customer_id: null }))).toEqual({
            key: "unresolved:u1",
            kind: "unresolved",
        });
    });

    it("is stable across identical rows — keys never use a label", () => {
        const a = hubKeyFor(conv({ family_label: "Kurzman Family" }));
        const b = hubKeyFor(conv({ family_label: "KURZMAN FAMILY  " }));
        expect(a.key).toBe(b.key);
    });
});

describe("selecting a hub is deterministic", () => {
    it("opens the newest UNRESOLVED conversation", () => {
        const hubs = buildCommunicationHubs([
            conv({ id: "old", attention_state: "needs_response", last_activity_at: "2026-08-10T00:00:00.000Z" }),
            conv({ id: "new", attention_state: "resolved", last_activity_at: "2026-08-14T00:00:00.000Z" }),
        ]);
        expect(hubs[0]!.primaryConversationId).toBe("old");
    });

    it("falls back to the newest when everything is resolved", () => {
        const hubs = buildCommunicationHubs([
            conv({ id: "old", attention_state: "resolved", last_activity_at: "2026-08-10T00:00:00.000Z" }),
            conv({ id: "new", attention_state: "resolved", last_activity_at: "2026-08-14T00:00:00.000Z" }),
        ]);
        expect(hubs[0]!.primaryConversationId).toBe("new");
    });

    it("finds the hub a conversation is displayed under", () => {
        const hubs = buildCommunicationHubs([conv({ id: "e1" }), conv({ id: "e2" })]);
        expect(findHubForConversation(hubs, "e2")?.key).toBe(`family:${KURZMAN}`);
        expect(findHubForConversation(hubs, "nope")).toBeNull();
        expect(findHubForConversation(hubs, null)).toBeNull();
    });
});

describe("channel projections are separate lists, not one filtered timeline", () => {
    const hubs = buildCommunicationHubs([
        conv({ id: "e1", channel: "email", topic_label: "Tour availability" }),
        conv({ id: "e2", channel: "email", topic_label: "Enrollment paperwork" }),
        conv({ id: "s1", channel: "sms" }),
    ]);

    it("Email returns only email conversations", () => {
        const email = hubConversationsForChannel(hubs[0]!, "email");
        expect(email.map((c) => c.id)).toEqual(["e1", "e2"]);
    });

    it("SMS returns only the SMS conversation", () => {
        const sms = hubConversationsForChannel(hubs[0]!, "sms");
        expect(sms.map((c) => c.id)).toEqual(["s1"]);
    });

    it("is empty for a hub that has no conversations on that channel", () => {
        const emailOnly = buildCommunicationHubs([conv({ id: "e1", channel: "email" })]);
        expect(hubConversationsForChannel(emailOnly[0]!, "sms")).toEqual([]);
    });

    it("is empty rather than throwing for no hub", () => {
        expect(hubConversationsForChannel(null, "email")).toEqual([]);
    });
});
