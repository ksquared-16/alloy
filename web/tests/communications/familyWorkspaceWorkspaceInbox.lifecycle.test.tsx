/** @vitest-environment jsdom */

/**
 * Workspace Inbox (`workspace_inbox`) runtime lifecycle hardening — Phase 2 closeout.
 *
 * Proves the Workspace surface inherits the canonical runtime lifecycle (no fork):
 *  - Failed send preserves draft + keeps composer expanded
 *  - Parent-driven selection change (queue selection) with out-of-order hydration
 *    cannot let a stale response overwrite the latest selection
 *
 * Note: Workspace switches conversations via the queue (parent-supplied `initialThreadId`),
 * not an in-view topic rail — the in-panel New Message + thread chips are `activity_embed`
 * only. The shared reply/new-message/thread-switch mechanism itself is exercised through the
 * same useFamilyCommunicationRuntime hook in familyWorkspaceActivityEmbed.threadSwitch.test.tsx
 * and familyWorkspaceWorkspaceInbox.parity.test.tsx.
 */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import FamilyCommunicationWorkspace from "@/app/adminV2/communications/FamilyCommunicationWorkspace";
import { emptyPreferenceProfile } from "@/lib/communications/v2/communicationPreferenceLabels";
import {
    resetDrawerFamilyWorkspacePrefetchCacheForTests,
    seedDrawerFamilyWorkspaceCacheForTests,
} from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchCache";
import type {
    FamilyCommunicationWorkspaceVM,
    ThreadVM,
    TimelineEventVM,
} from "@/lib/communications/v2/familyWorkspace/types";

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

const threadA: ThreadVM = {
    id: "t-a", subject: "Enrollment Packet", channel: "email",
    primaryEntity: { type: "persons", id: "person-1" }, childId: null, opportunityId: null,
    lastActivityAt: "2026-07-08T12:00:00Z", messageCount: 1, unread: 0, slaState: null, attentionState: null,
};
const threadB: ThreadVM = {
    id: "t-b", subject: "SMS Chat", channel: "sms",
    primaryEntity: { type: "persons", id: "person-1" }, childId: null, opportunityId: null,
    lastActivityAt: "2026-07-09T12:00:00Z", messageCount: 1, unread: 0, slaState: null, attentionState: null,
};

function msg(over: Partial<TimelineEventVM> & { id: string; threadId: string; body: string }): TimelineEventVM {
    return {
        direction: "outbound", channel: over.channel ?? "email", createdAt: over.createdAt ?? "2026-07-08T12:00:00Z",
        kind: "message", deliveredAt: null, openedAt: null, repliedAt: null, sentAt: null, status: "sent", ...over,
    };
}

function buildVm(messages: TimelineEventVM[]): FamilyCommunicationWorkspaceVM {
    return {
        family: { id: "cust-1", label: "Kurzman Family", program: null, location: { id: null, label: null }, stage: null, ownerUserId: null, ownerLabel: null, lifecycleStage: "lead" },
        children: [],
        recipientGroups: [{ tier: "primary", uiLabel: "Primary", recipients: [recipient] }],
        eligibleRecipients: [recipient],
        disabledRecipients: [],
        selectedRecipients: ["person-1"],
        consentSummary: {
            byContact: {},
            household: { email: "unset", sms: "unset", marketing: "unset" },
            preferenceProfile: emptyPreferenceProfile(),
            preferenceProfilesByContact: {},
            displayFlags: { email: true, sms: true, marketing: true },
        },
        composerDraft: { channel: "email", recipientContactIds: ["person-1"], subject: null, body: "", availableChannels: { email: true, sms: true, note: false, reasons: {} }, consentBlockers: [] },
        scope: { level: "family", customerId: "cust-1", focusChildId: null, focusOpportunityId: null, focusPersonId: null },
        threads: [threadA, threadB],
        selectedThread: null,
        messages,
        timelineEvents: [
            msg({ id: "m-a", threadId: "t-a", body: "Alpha thread message", channel: "email" }),
            msg({ id: "m-b", threadId: "t-b", body: "Beta thread message", channel: "sms", createdAt: "2026-07-09T12:00:00Z" }),
        ],
        healthSummary: { status: "healthy", engagementScore: 80, responseRate: null, lastContactAt: "2026-07-09T12:00:00Z", unreadCount: 0 },
        relatedTasks: [],
    };
}

let container: HTMLElement | null = null;
let root: Root | null = null;

function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(node); });
    return container;
}

async function flush(): Promise<void> {
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function buttonByText(el: HTMLElement, text: string): HTMLButtonElement {
    const button = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
    expect(button, `button "${text}"`).toBeTruthy();
    return button as HTMLButtonElement;
}

function setTextarea(el: HTMLElement, value: string): HTMLTextAreaElement {
    const textarea = el.querySelector('textarea[aria-label="Message body"]') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return textarea;
}

function seedWarm(): void {
    seedDrawerFamilyWorkspaceCacheForTests({ customerId: "cust-1", composerChannel: "email", threadId: "t-a" }, buildVm([msg({ id: "m-a", threadId: "t-a", body: "Alpha thread message", channel: "email" })]));
    seedDrawerFamilyWorkspaceCacheForTests({ customerId: "cust-1", composerChannel: "sms", threadId: "t-b" }, buildVm([msg({ id: "m-b", threadId: "t-b", body: "Beta thread message", channel: "sms" })]));
    seedDrawerFamilyWorkspaceCacheForTests({ customerId: "cust-1", composerChannel: "email", threadId: null }, buildVm([]));
}

describe("workspace_inbox runtime lifecycle (Phase 2 closeout)", () => {
    beforeEach(() => {
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
        seedWarm();
        fetchMock.mockReset();
    });

    afterEach(() => {
        act(() => { root?.unmount(); });
        container?.remove();
        container = null;
        root = null;
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
    });

    it("failed send preserves draft and keeps the composer expanded", async () => {
        fetchMock.mockImplementation(async (url: string) => {
            if (String(url).includes("/family-send")) return new Response(JSON.stringify({ error: "Send failed" }), { status: 500 });
            if (String(url).includes("/family-workspace")) return new Response(JSON.stringify({ workspace: buildVm([msg({ id: "m-a", threadId: "t-a", body: "Alpha thread message", channel: "email" })]) }), { status: 200 });
            return new Response("{}", { status: 404 });
        });

        const el = render(<FamilyCommunicationWorkspace customerId="cust-1" initialThreadId="t-a" surfaceVariant="workspace_inbox" />);
        await flush();

        await act(async () => { buttonByText(el, "Reply").click(); });
        setTextarea(el, "Precious unsent draft");
        await flush();

        await act(async () => { buttonByText(el, "Send reply").click(); await Promise.resolve(); await Promise.resolve(); });
        await flush();

        expect(el.textContent).toContain("Send failed");
        const textarea = el.querySelector('textarea[aria-label="Message body"]') as HTMLTextAreaElement;
        expect(textarea).toBeTruthy();
        expect(textarea.value).toBe("Precious unsent draft");
        expect(el.querySelector('[data-cc-reply-collapsed]')).toBeFalsy();
    });

    it("ignores a stale hydration after the queue selects a different conversation", async () => {
        // Mirrors queue-driven selection: the parent swaps `initialThreadId`, which resets
        // runtime scope. A slow revalidation for the previous thread must not overwrite the
        // newly-selected thread (request-sequence + selected-thread stale guards).
        fetchMock.mockImplementation(async (url: string) => {
            const u = new URL(String(url), "http://localhost");
            if (!String(url).includes("/family-workspace")) return new Response("{}", { status: 404 });
            const threadId = u.searchParams.get("thread_id");
            if (threadId === "t-a") {
                await new Promise((r) => setTimeout(r, 250));
                return new Response(JSON.stringify({ workspace: buildVm([msg({ id: "m-a-late", threadId: "t-a", body: "Alpha thread message LATE", channel: "email" })]) }), { status: 200 });
            }
            if (threadId === "t-b") {
                await new Promise((r) => setTimeout(r, 20));
                return new Response(JSON.stringify({ workspace: buildVm([msg({ id: "m-b", threadId: "t-b", body: "Beta thread message", channel: "sms" })]) }), { status: 200 });
            }
            return new Response(JSON.stringify({ workspace: buildVm([]) }), { status: 200 });
        });

        const el = render(<FamilyCommunicationWorkspace customerId="cust-1" initialThreadId="t-a" surfaceVariant="workspace_inbox" />);
        await flush();
        expect(el.textContent).toContain("Alpha thread message");

        // Queue selects a different conversation → parent re-renders with new initialThreadId.
        await act(async () => {
            root!.render(<FamilyCommunicationWorkspace customerId="cust-1" initialThreadId="t-b" surfaceVariant="workspace_inbox" />);
            await Promise.resolve();
        });
        await flush();
        expect(el.textContent).toContain("Beta thread message");

        // Let the slow t-a revalidation resolve — it must be discarded as stale.
        await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
        await flush();

        expect(el.textContent).toContain("Beta thread message");
        expect(el.textContent).not.toContain("Alpha thread message LATE");
    });
});
