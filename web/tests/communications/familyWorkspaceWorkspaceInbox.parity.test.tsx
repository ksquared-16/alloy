/** @vitest-environment jsdom */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import FamilyCommunicationWorkspace from "@/app/adminV2/communications/FamilyCommunicationWorkspace";
import {
    resetDrawerFamilyWorkspacePrefetchCacheForTests,
    seedDrawerFamilyWorkspaceCacheForTests,
} from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchCache";
import type { FamilyCommunicationWorkspaceVM } from "@/lib/communications/v2/familyWorkspace/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/communications/v2/flags", () => ({
    isCommsV2FlagEnabled: (key: string) => key === "comms_v2_live_workspace",
}));

vi.mock("@/contexts/AdminAuthContext", () => ({
    useAdminAuthOptional: () => ({ userId: "user-1" }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const recipient = {
    id: "person-1",
    displayName: "Kelly Kurzman",
    roleType: "parent",
    roleLabel: "Parent",
    isPrimary: true,
    tier: "primary" as const,
    email: "kelly@example.com",
    phone: "+15551234567",
    channels: {
        email: { hasAddress: true, providerBound: true, available: true, unavailableReason: null, marketing: "unset" as const, transactional: "unset" as const, canSendTransactional: true, canSendMarketing: true },
        sms: { hasAddress: true, providerBound: true, available: true, unavailableReason: null, marketing: "unset" as const, transactional: "unset" as const, canSendTransactional: true, canSendMarketing: true },
    },
};

function buildVm(body: string): FamilyCommunicationWorkspaceVM {
    return {
        family: {
            id: "cust-1",
            label: "Kurzman Family",
            program: null,
            location: { id: null, label: null },
            stage: null,
            ownerUserId: null,
            ownerLabel: null,
            lifecycleStage: "lead",
        },
        children: [],
        recipientGroups: [{ tier: "primary", uiLabel: "Primary", recipients: [recipient] }],
        eligibleRecipients: [recipient],
        disabledRecipients: [],
        selectedRecipients: ["person-1"],
        consentSummary: {
            byContact: {},
            household: { email: "unset", sms: "unset", marketing: "unset" },
            preferenceProfile: {
                email_transactional: "unset",
                sms_transactional: "unset",
                email_marketing: "unset",
                sms_marketing: "unset",
            },
            displayFlags: { email: true, sms: true, marketing: true },
        },
        composerDraft: {
            channel: "email",
            recipientContactIds: ["person-1"],
            subject: null,
            body: "",
            availableChannels: { email: true, sms: true, note: false, reasons: {} },
            consentBlockers: [],
        },
        scope: { level: "family", customerId: "cust-1", focusChildId: null, focusOpportunityId: null, focusPersonId: null },
        threads: [{
            id: "thread-1",
            subject: "Enrollment Packet",
            channel: "email",
            primaryEntity: { type: "persons", id: "person-1" },
            childId: null,
            opportunityId: null,
            lastActivityAt: "2026-07-08T12:00:00Z",
            messageCount: 1,
            unread: 0,
            slaState: null,
            attentionState: null,
        }],
        selectedThread: null,
        messages: [{
            id: body.includes("confirmed") ? "m-confirmed" : "m-1",
            threadId: "thread-1",
            direction: "outbound",
            channel: "email",
            body,
            createdAt: "2026-07-08T12:00:00Z",
            kind: "message",
            deliveredAt: null,
            openedAt: null,
            repliedAt: null,
            sentAt: null,
            status: "sent",
            senderUserId: "user-1",
        }],
        timelineEvents: [],
        healthSummary: {
            status: "healthy",
            engagementScore: 80,
            responseRate: null,
            lastContactAt: "2026-07-08T12:00:00Z",
            unreadCount: 0,
        },
        relatedTasks: [],
    };
}

let container: HTMLElement | null = null;
let root: Root | null = null;

function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root!.render(node);
    });
    return container;
}

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

function buttonByText(el: HTMLElement, text: string): HTMLButtonElement {
    const button = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
    expect(button).toBeTruthy();
    return button as HTMLButtonElement;
}

describe("family workspace workspace_inbox parity", () => {
    beforeEach(() => {
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
        seedDrawerFamilyWorkspaceCacheForTests(
            { customerId: "cust-1", composerChannel: "email", threadId: "thread-1" },
            buildVm("Initial thread message"),
        );
        fetchMock.mockReset();
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
            if (String(url).includes("/family-send")) {
                const body = JSON.parse(String(init?.body ?? "{}")) as { confirm?: boolean };
                return new Response(
                    JSON.stringify({
                        mode: body.confirm ? "sent" : "preflight",
                        summary: body.confirm
                            ? { ready: 0, blocked: 0, sent: 1, failed: 0 }
                            : { ready: 1, blocked: 0, sent: 0, failed: 0 },
                        results: [{ person_id: "person-1", display_name: "Kelly Kurzman", status: body.confirm ? "sent" : "ready", thread_id: "thread-1" }],
                    }),
                    { status: 200 },
                );
            }
            if (String(url).includes("/family-workspace")) {
                return new Response(JSON.stringify({ workspace: buildVm("Reply confirmed") }), { status: 200 });
            }
            return new Response("{}", { status: 404 });
        });
    });

    afterEach(() => {
        act(() => {
            root?.unmount();
        });
        container?.remove();
        container = null;
        root = null;
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
    });

    it("uses Activity reply lifecycle in the wider Workspace presentation", async () => {
        const el = render(
            <FamilyCommunicationWorkspace
                customerId="cust-1"
                initialThreadId="thread-1"
                surfaceVariant="workspace_inbox"
            />,
        );

        await flush();

        expect(el.textContent).toMatch(/Initial thread message|Reply confirmed/);
        expect(el.querySelector('[data-cc-reply-collapsed]')).toBeTruthy();

        await act(async () => {
            buttonByText(el, "Reply").click();
        });
        const bodyEl =
            (el.querySelector('[aria-label="Message body"][contenteditable="true"]') as HTMLElement | null)
            ?? (el.querySelector('textarea[aria-label="Message body"]') as HTMLTextAreaElement | null);
        expect(bodyEl).toBeTruthy();

        await act(async () => {
            if (bodyEl instanceof HTMLTextAreaElement) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                setter?.call(bodyEl, "Please review the packet.");
                bodyEl.dispatchEvent(new Event("input", { bubbles: true }));
            } else if (bodyEl) {
                bodyEl.focus();
                bodyEl.textContent = "Please review the packet.";
                bodyEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
            }
        });

        await act(async () => {
            buttonByText(el, "Send reply").click();
            await Promise.resolve();
        });
        await flush();
        /*
         * The confirmation dialog PORTALS to `document.body` — asserted here
         * rather than assumed. Rendered in place it lived inside the Focus
         * Panel's stacking context, so the panel body dimmed while the panel
         * HEADER stayed bright and its controls stayed live behind a modal that
         * was supposedly blocking. Escaping the stacking context is the fix; no
         * z-index could have been, which is why this test now looks outside the
         * mounted subtree instead of raising a number.
         */
        const overlayRoot = document.body;
        expect(el.querySelector("[data-cc-send-confirm-dialog='true']")).toBeNull();
        expect(overlayRoot.querySelector("[data-cc-send-confirm-dialog='true']")).toBeTruthy();
        expect(overlayRoot.textContent).toContain("Ready to send");

        await act(async () => {
            buttonByText(overlayRoot as unknown as HTMLElement, "Confirm send").click();
            await Promise.resolve();
            await Promise.resolve();
        });
        await flush();

        expect(overlayRoot.textContent).toMatch(/Message sent|Tour invitation sent/);
        expect(overlayRoot.querySelector("[data-cc-send-success='true']")).toBeTruthy();

        await act(async () => {
            buttonByText(overlayRoot as unknown as HTMLElement, "Done").click();
            await Promise.resolve();
        });
        await flush();

        expect(el.textContent).toContain("Reply confirmed");
        expect(el.querySelector('[data-cc-reply-collapsed]')).toBeTruthy();
        expect(el.querySelector('[aria-label="Message body"]')).toBeFalsy();
    });
});
