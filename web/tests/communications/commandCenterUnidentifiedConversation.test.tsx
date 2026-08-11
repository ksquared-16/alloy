// @vitest-environment jsdom
/**
 * The Command Center must be able to open and answer a parent Alloy has not
 * identified.
 *
 * Two defects are locked here, both on the operator's DEFAULT Communications
 * surface (`comms_v2_command_center` defaults ON):
 *
 *   1. Selection treated "loadable" — which means "the family workspace can
 *      build a household view" — as a veto rather than a preference, so clicking
 *      an unidentified conversation bounced the operator to a different one.
 *
 *   2. Nothing rendered such a conversation, so it fell through to a
 *      "Loading conversation" placeholder that never resolved. The parent's
 *      message was received, retained and listed in the queue, and unanswerable.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import UnidentifiedConversationPanel, {
    isUnidentifiedConversation,
} from "@/app/adminV2/communications/UnidentifiedConversationPanel";
import {
    isQueueRowLoadable,
    resolveCommandCenterSelectionPreferringLoadable,
} from "@/lib/communications/v2/commandCenterViewModel";
import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";

const THREAD = "aaaaaaaa-0000-0000-0000-00000000000c";

function conversation(partial: Partial<ConversationSummary> = {}): ConversationSummary {
    return {
        id: THREAD,
        channel: "sms",
        recipient_key: "+15557770009",
        scope_status: "unresolved",
        customer_id: null,
        attention_state: "needs_response",
        ...partial,
    } as ConversationSummary;
}

describe("selection never overrides the operator", () => {
    it("keeps an unidentified conversation selected when the operator picked it", () => {
        const visible = ["resolved-1", THREAD];
        const loadable = ["resolved-1"];
        expect(resolveCommandCenterSelectionPreferringLoadable(THREAD, visible, loadable)).toBe(THREAD);
    });

    it("still prefers a loadable row when nothing is selected", () => {
        expect(
            resolveCommandCenterSelectionPreferringLoadable(null, ["unresolved-1", "resolved-1"], ["resolved-1"])
        ).toBe("resolved-1");
    });

    it("falls back to the first visible row when none is loadable", () => {
        expect(resolveCommandCenterSelectionPreferringLoadable(null, ["unresolved-1"], [])).toBe("unresolved-1");
    });

    it("drops a selection that is no longer visible", () => {
        expect(resolveCommandCenterSelectionPreferringLoadable("gone", ["resolved-1"], ["resolved-1"])).toBe(
            "resolved-1"
        );
    });

    it("an unidentified conversation is still not household-loadable", () => {
        // The panel exists precisely because this stays false.
        expect(isQueueRowLoadable(conversation())).toBe(false);
        expect(isUnidentifiedConversation(conversation())).toBe(true);
        expect(isUnidentifiedConversation(conversation({ scope_status: "ambiguous" }))).toBe(true);
        expect(
            isUnidentifiedConversation(conversation({ scope_status: "resolved", customer_id: "c1" }))
        ).toBe(false);
    });
});

let container: HTMLDivElement;
let root: Root;
let requests: Array<{ url: string; body: Record<string, unknown> | null }>;

function stubFetch(sendResponse: { status: number; payload: Record<string, unknown> }) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: { body?: string }) => {
            const u = String(url);
            requests.push({ url: u, body: init?.body ? JSON.parse(init.body) : null });
            if (u.includes("/messages")) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        messages: [
                            {
                                id: "m1",
                                direction: "inbound",
                                channel: "sms",
                                body: "Do you have openings for a 3 year old?",
                                created_at: "2026-08-10T10:00:00.000Z",
                            },
                        ],
                    }),
                } as unknown as Response;
            }
            return {
                ok: sendResponse.status >= 200 && sendResponse.status < 300,
                status: sendResponse.status,
                json: async () => sendResponse.payload,
            } as unknown as Response;
        })
    );
}

async function mount(c: ConversationSummary, onReplied?: () => void) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root.render(<UnidentifiedConversationPanel conversation={c} onReplied={onReplied} />);
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

async function clickSend() {
    const btn = [...container.querySelectorAll("button")].find((b) =>
        /Send now|Sending/.test(b.textContent ?? "")
    )! as HTMLButtonElement;
    await act(async () => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

beforeEach(() => {
    requests = [];
});

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
});

describe("the unidentified conversation workspace", () => {
    it("shows the parent's message instead of a placeholder that never resolves", async () => {
        stubFetch({ status: 200, payload: { ok: true, outcome: "sent_to_queue" } });
        await mount(conversation());

        expect(container.textContent).toContain("Do you have openings for a 3 year old?");
        expect(container.textContent).not.toContain("Loading conversation");
        expect(container.querySelector('[data-cc-message-direction="inbound"]')).toBeTruthy();
    });

    it("names the sender honestly and never shows the number", async () => {
        stubFetch({ status: 200, payload: { ok: true, outcome: "sent_to_queue" } });
        await mount(conversation());

        expect(container.textContent).toContain("Unidentified sender");
        expect(container.textContent).toContain("ending in 0009");
        expect(container.textContent).not.toContain("+15557770009");
    });

    it("says routing needs review when the sender was ambiguous", async () => {
        stubFetch({ status: 200, payload: { ok: true, outcome: "sent_to_queue" } });
        await mount(conversation({ scope_status: "ambiguous" }));

        expect(container.textContent).toContain("Needs identity review");
        expect(container.querySelector("[data-cc-routing-notice]")).toBeTruthy();
        expect(container.textContent).not.toContain("ambiguous_sender");
        expect(container.textContent).not.toContain("scope_status");
    });

    it("replies with the conversation as the only authority", async () => {
        stubFetch({ status: 200, payload: { ok: true, outcome: "sent_to_queue" } });
        const onReplied = vi.fn();
        await mount(conversation(), onReplied);

        typeBody("We do — what age is your child?");
        await clickSend();

        const send = requests.find((r) => r.url.includes("/api/admin/communications/send"))!;
        expect(send).toBeTruthy();
        expect(send.body!.thread_id).toBe(THREAD);
        expect(send.body!.category).toBe("operational");
        expect(send.body!.recipient_person_id).toBeUndefined();
        for (const field of ["to", "to_address", "phone", "email", "recipient_address"]) {
            expect(send.body![field]).toBeUndefined();
        }
        expect(JSON.stringify(send.body)).not.toContain("15557770009");
        expect(container.textContent).toContain("SMS queued.");
        expect(onReplied).toHaveBeenCalledTimes(1);
    });

    it("tells the truth when eligibility refuses on a 200", async () => {
        // The thread-reply branch answers HTTP 200 with ok:false. Reading only the
        // status code would show a queued reply that was never sent.
        stubFetch({
            status: 200,
            payload: {
                ok: false,
                outcome: "blocked",
                reason: "inbound_stop_hold",
                message: "This number asked to stop receiving messages.",
            },
        });
        const onReplied = vi.fn();
        await mount(conversation(), onReplied);

        typeBody("Following up.");
        await clickSend();

        expect(container.textContent).toContain("This number asked to stop receiving messages.");
        expect(container.textContent).not.toContain("SMS queued.");
        expect(onReplied).not.toHaveBeenCalled();
        expect(container.querySelector("textarea")!.value).toBe("Following up.");
    });

    it("offers only the channel the message arrived on", async () => {
        stubFetch({ status: 200, payload: { ok: true, outcome: "sent_to_queue" } });
        await mount(conversation({ channel: "sms" }));
        const panel = container.querySelector("[data-cc-reply-authority]")!;
        expect(panel.getAttribute("data-cc-reply-authority")).toBe("thread");
    });
});
