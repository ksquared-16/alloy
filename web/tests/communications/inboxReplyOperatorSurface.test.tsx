// @vitest-environment jsdom
/**
 * A5 — what the operator sees, and what the Reply action actually sends.
 *
 * The real `InboxThreadReplyBox` is mounted and driven. That is the point: the
 * defect this closes was a component putting `to: "+1555…"` on the wire, which
 * no assertion about a helper function would have caught, and which every
 * source-text check would have called correct because the field was named
 * plausibly.
 *
 * `fetch` is captured rather than stubbed away, so the request body is the
 * artefact under test.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InboxThreadReplyBox from "@/components/adminV2/messaging/InboxThreadReplyBox";
import { INBOX_REPLY_FORBIDDEN_FIELDS } from "@/lib/communications/inboxReplySend";
import type { InboxThreadListItem } from "@/lib/communications/inboxThreadTypes";

const PERSON = "33333333-3333-3333-3333-333333333333";
const THREAD_RESOLVED = "aaaaaaaa-0000-0000-0000-00000000000a";
const THREAD_UNKNOWN = "aaaaaaaa-0000-0000-0000-00000000000c";

function thread(partial: Partial<InboxThreadListItem>): InboxThreadListItem {
    return {
        id: THREAD_RESOLVED,
        org_id: "org",
        channel: "sms",
        recipient_key: "+15551230001",
        primary_entity_type: "persons",
        primary_entity_id: PERSON,
        created_at: null,
        updated_at: null,
        last_message_at: "2026-08-10T12:00:00.000Z",
        archived_at: null,
        is_archived: false,
        sort_at: "2026-08-10T12:00:00.000Z",
        contact_display: "Jordan Smith",
        family_display: null,
        location_display: null,
        status_display: null,
        related_children_display: null,
        related_contacts_display: null,
        context_display: null,
        channel_contact_display: "(555) 123-0001",
        preview_lead: "SMS · Thursday works, thank you!",
        reply_person_id: PERSON,
        reply_email_available: false,
        reply_sms_available: true,
        can_reply: true,
        sender_identity_state: "identified",
        routing_state: "routed",
        routing_candidate_count: 0,
        routing_notice: null,
        reply_authority: "person",
        reply_display_label: "Jordan Smith",
        entity_chip: null,
        last_message_preview: {
            direction: "inbound",
            channel: "sms",
            status: "received",
            body: "Thursday works, thank you!",
            created_at: "2026-08-10T12:00:00.000Z",
        },
        has_unread: true,
        ...partial,
    };
}

const RESOLVED = thread({});

const UNIDENTIFIED = thread({
    id: THREAD_UNKNOWN,
    recipient_key: "+15551239999",
    primary_entity_type: "communications_unknown",
    primary_entity_id: "surrogate-unknown",
    contact_display: "Unidentified sender · ending in 9999",
    channel_contact_display: "(555) 123-9999",
    reply_person_id: null,
    reply_sms_available: true,
    sender_identity_state: "unidentified",
    reply_authority: "thread",
    reply_display_label: "ending in 9999",
});

const AMBIGUOUS = thread({
    id: "aaaaaaaa-0000-0000-0000-00000000000b",
    recipient_key: "+15551230002",
    primary_entity_type: "communications_unknown",
    primary_entity_id: "surrogate-ambiguous",
    contact_display: "Unidentified sender · ending in 0002",
    reply_person_id: null,
    sender_identity_state: "unidentified",
    routing_state: "needs_routing_resolution",
    routing_candidate_count: 2,
    routing_notice: "Needs routing — 2 people in this organization share this number.",
    reply_authority: "thread",
    reply_display_label: "ending in 0002",
});

let container: HTMLDivElement;
let root: Root;
let requests: Array<{ url: string; body: Record<string, unknown> }>;

function mount(item: InboxThreadListItem, onSent?: () => void) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root.render(<InboxThreadReplyBox thread={item} onSent={onSent} />);
    });
}

function typeBody(text: string) {
    const textarea = container.querySelector("textarea")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(textarea, text);
    act(() => {
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function sendButton(): HTMLButtonElement {
    const buttons = [...container.querySelectorAll("button")] as HTMLButtonElement[];
    return buttons.find((b) => /Send now|Sending/.test(b.textContent ?? ""))!;
}

async function clickSend() {
    await act(async () => {
        sendButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

function respondWith(status: number, payload: Record<string, unknown>) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: { body: string }) => {
            requests.push({ url: String(url), body: JSON.parse(init.body) });
            return {
                ok: status >= 200 && status < 300,
                status,
                json: async () => payload,
            } as unknown as Response;
        })
    );
}

beforeEach(() => {
    requests = [];
});

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
});

describe("A5 — reply presentation", () => {
    it("names the person when the sender is known", () => {
        mount(RESOLVED);
        expect(container.textContent).toContain("Reply to Jordan Smith");
        expect(container.querySelector("[data-adminv2-sender-identity]")?.getAttribute("data-adminv2-sender-identity")).toBe(
            "identified"
        );
    });

    it("names a masked endpoint, never the number, when the sender is unknown", () => {
        mount(UNIDENTIFIED);
        expect(container.textContent).toContain("Reply to ending in 9999");
        expect(container.textContent).not.toContain("+15551239999");
        expect(container.textContent).not.toContain("(555) 123-9999");
    });

    it("states routing ambiguity in operator language with no ids or enums", () => {
        mount(AMBIGUOUS);
        const notice = container.querySelector("[data-adminv2-routing-notice]")!;
        expect(notice.textContent).toBe(
            "Needs routing — 2 people in this organization share this number."
        );
        expect(container.textContent).not.toContain("needs_routing_resolution");
        expect(container.textContent).not.toContain("ambiguous_sender");
    });

    it("offers the Reply affordance on an unidentified conversation", () => {
        mount(UNIDENTIFIED);
        expect(sendButton()).toBeTruthy();
        expect(container.querySelector("textarea")?.hasAttribute("disabled")).toBe(false);
        expect(
            container.querySelector("[data-adminv2-reply-authority]")?.getAttribute("data-adminv2-reply-authority")
        ).toBe("thread");
    });
});

describe("A5 — what the Reply action puts on the wire", () => {
    it("sends a resolved thread by person id and no address", async () => {
        respondWith(200, { ok: true, outcome: "sent_to_queue", communication_message_id: "m1" });
        mount(RESOLVED);
        typeBody("See you Thursday.");
        await clickSend();

        expect(requests).toHaveLength(1);
        const body = requests[0]!.body;
        expect(requests[0]!.url).toBe("/api/admin/communications/send");
        expect(body.recipient_person_id).toBe(PERSON);
        expect(body.thread_id).toBeUndefined();
        expect(body.category).toBe("operational");
        for (const field of INBOX_REPLY_FORBIDDEN_FIELDS) {
            expect(body[field]).toBeUndefined();
        }
    });

    it("sends an unidentified thread by thread id and no address", async () => {
        respondWith(200, { ok: true, outcome: "sent_to_queue", message_id: "m2" });
        mount(UNIDENTIFIED);
        typeBody("We do have openings — what age?");
        await clickSend();

        expect(requests).toHaveLength(1);
        const body = requests[0]!.body;
        expect(body.thread_id).toBe(THREAD_UNKNOWN);
        expect(body.recipient_person_id).toBeUndefined();
        // The surrogate anchor would be rejected by the person-oriented
        // validation, and the server reads the anchor off the thread anyway.
        expect(body.entity_type).toBeUndefined();
        expect(body.entity_id).toBeUndefined();
        for (const field of INBOX_REPLY_FORBIDDEN_FIELDS) {
            expect(body[field]).toBeUndefined();
        }
    });

    it("never puts the phone number on the wire for any thread shape", async () => {
        for (const item of [RESOLVED, UNIDENTIFIED, AMBIGUOUS]) {
            requests = [];
            respondWith(200, { ok: true, outcome: "sent_to_queue" });
            mount(item);
            typeBody("Reply body.");
            await clickSend();
            const serialized = JSON.stringify(requests[0]!.body);
            expect(serialized).not.toContain(item.recipient_key!);
            act(() => root.unmount());
            container.remove();
        }
    });
});

describe("A5 — a blocked reply is reported as blocked", () => {
    it("does not claim a queued send when canonical eligibility refuses on a 200", async () => {
        const onSent = vi.fn();
        // The thread-reply branch answers HTTP 200 with ok:false. Reading only the
        // status code would show the operator a queued reply that was never sent.
        respondWith(200, {
            ok: false,
            outcome: "blocked",
            reason: "inbound_stop_hold",
            message: "This number asked to stop receiving messages.",
        });
        mount(UNIDENTIFIED, onSent);
        typeBody("Following up.");
        await clickSend();

        expect(container.textContent).toContain("This number asked to stop receiving messages.");
        expect(container.textContent).not.toContain("SMS queued.");
        // onSent is what refreshes the history. Not firing it is what keeps a
        // blocked reply from appearing in the conversation as a sent message.
        expect(onSent).not.toHaveBeenCalled();
        // The draft is kept so the operator does not retype it.
        expect(container.querySelector("textarea")?.value).toBe("Following up.");
    });

    it("reports a person-path block returned as a 409", async () => {
        const onSent = vi.fn();
        respondWith(409, {
            error: "Quiet hours are in effect for this recipient.",
            code: "quiet_hours",
            outcome: "blocked",
        });
        mount(RESOLVED, onSent);
        typeBody("Quick question.");
        await clickSend();

        expect(container.textContent).toContain("Quiet hours are in effect for this recipient.");
        expect(container.textContent).not.toContain("SMS queued.");
        expect(onSent).not.toHaveBeenCalled();
    });

    it("confirms and clears only on a genuine queued outcome", async () => {
        const onSent = vi.fn();
        respondWith(200, { ok: true, outcome: "sent_to_queue" });
        mount(UNIDENTIFIED, onSent);
        typeBody("On our way.");
        await clickSend();

        expect(container.textContent).toContain("SMS queued.");
        expect(onSent).toHaveBeenCalledTimes(1);
        expect(container.querySelector("textarea")?.value).toBe("");
    });
});
