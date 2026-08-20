/** @vitest-environment jsdom */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type {
    FamilyCommunicationWorkspaceVM,
    ThreadVM,
    TimelineEventVM,
} from "@/lib/communications/v2/familyWorkspace/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/communications/v2/flags", () => ({
    isCommsV2FlagEnabled: (key: string) =>
        key === "comms_v2_live_workspace" || key === "comms_v2_record_tab",
}));

vi.mock("@/contexts/AdminAuthContext", () => ({
    useAdminAuthOptional: () => ({ userId: "user-1" }),
}));

import FamilyCommunicationWorkspace from "@/app/adminV2/communications/FamilyCommunicationWorkspace";
import { emptyPreferenceProfile } from "@/lib/communications/v2/communicationPreferenceLabels";
import {
    resetDrawerFamilyWorkspacePrefetchCacheForTests,
    seedDrawerFamilyWorkspaceCacheForTests,
} from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchCache";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const threadA: ThreadVM = {
    id: "t-a",
    subject: "Enrollment Packet",
    channel: "email",
    primaryEntity: { type: "persons", id: "person-kelly" },
    childId: null,
    opportunityId: null,
    lastActivityAt: "2026-07-08T12:00:00Z",
    messageCount: 2,
    unread: 0,
    slaState: null,
    attentionState: null,
};

const threadB: ThreadVM = {
    id: "t-b",
    subject: "SMS Chat",
    channel: "sms",
    primaryEntity: { type: "persons", id: "person-kelly" },
    childId: null,
    opportunityId: null,
    lastActivityAt: "2026-07-09T12:00:00Z",
    messageCount: 1,
    unread: 0,
    slaState: null,
    attentionState: null,
};

const kellyRecipient = {
    id: "person-kelly",
    displayName: "Kelly Kurzman",
    roleType: "parent",
    roleLabel: "Parent",
    isPrimary: true,
    tier: "primary" as const,
    email: "kelly@example.com",
    phone: "+15551234567",
    channels: {
        email: {
            hasAddress: true,
            providerBound: true,
            available: true,
            unavailableReason: null,
            marketing: "unset" as const,
            transactional: "unset" as const,
            canSendTransactional: true,
            canSendMarketing: true,
        },
        sms: {
            hasAddress: true,
            providerBound: true,
            available: true,
            unavailableReason: null,
            marketing: "unset" as const,
            transactional: "unset" as const,
            canSendTransactional: true,
            canSendMarketing: true,
        },
    },
};

function msg(over: Partial<TimelineEventVM> & { id: string; threadId: string; body: string }): TimelineEventVM {
    return {
        direction: "outbound",
        channel: over.channel ?? "email",
        createdAt: over.createdAt ?? "2026-07-08T12:00:00Z",
        kind: "message",
        deliveredAt: null,
        openedAt: null,
        repliedAt: null,
        sentAt: null,
        status: "sent",
        ...over,
    };
}

function buildVm(messages: TimelineEventVM[]): FamilyCommunicationWorkspaceVM {
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
        recipientGroups: [{ tier: "primary", uiLabel: "Primary", recipients: [kellyRecipient] }],
        eligibleRecipients: [kellyRecipient],
        disabledRecipients: [],
        selectedRecipients: ["person-kelly"],
        consentSummary: {
            byContact: {},
            household: { email: "unset", sms: "unset", marketing: "unset" },
            preferenceProfile: emptyPreferenceProfile(),
            preferenceProfilesByContact: {},
            displayFlags: { email: true, sms: true, marketing: true },
        },
        composerDraft: {
            channel: "email",
            recipientContactIds: ["person-kelly"],
            subject: null,
            body: "",
            availableChannels: { email: true, sms: true, note: false, reasons: {} },
            consentBlockers: [],
        },
        scope: {
            level: "family",
            customerId: "cust-1",
            focusChildId: null,
            focusOpportunityId: null,
            focusPersonId: null,
        },
        threads: [threadA, threadB],
        selectedThread: null,
        messages,
        timelineEvents: [
            msg({ id: "m-a", threadId: "t-a", body: "Alpha thread message", channel: "email" }),
            msg({ id: "m-b", threadId: "t-b", body: "Beta thread message", channel: "sms", createdAt: "2026-07-09T12:00:00Z" }),
        ],
        healthSummary: {
            status: "healthy",
            engagementScore: 80,
            responseRate: null,
            lastContactAt: "2026-07-09T12:00:00Z",
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

function seedCaches(): void {
    const entity = { entityType: "opportunities", entityId: "opp-1" };
    seedDrawerFamilyWorkspaceCacheForTests({ ...entity, composerChannel: "email" }, buildVm([]));
    seedDrawerFamilyWorkspaceCacheForTests(
        { ...entity, composerChannel: "email", threadId: "t-a" },
        buildVm([msg({ id: "m-a", threadId: "t-a", body: "Alpha thread message", channel: "email" })]),
    );
    seedDrawerFamilyWorkspaceCacheForTests(
        { ...entity, composerChannel: "sms", threadId: "t-b" },
        buildVm([msg({ id: "m-b", threadId: "t-b", body: "Beta thread message", channel: "sms" })]),
    );
}

function installDelayedFetchMock(): void {
    fetchMock.mockImplementation(async (url: string) => {
        const u = new URL(String(url), "http://localhost");
        if (!String(url).includes("/family-workspace")) {
            return new Response("{}", { status: 404 });
        }
        const threadId = u.searchParams.get("thread_id");
        if (threadId === "t-a") {
            await new Promise((r) => setTimeout(r, 250));
            return new Response(
                JSON.stringify({
                    workspace: buildVm([msg({ id: "m-a-late", threadId: "t-a", body: "Alpha thread message LATE", channel: "email" })]),
                }),
                { status: 200 },
            );
        }
        if (threadId === "t-b") {
            await new Promise((r) => setTimeout(r, 30));
            return new Response(
                JSON.stringify({
                    workspace: buildVm([msg({ id: "m-b", threadId: "t-b", body: "Beta thread message", channel: "sms" })]),
                }),
                { status: 200 },
            );
        }
        return new Response(JSON.stringify({ workspace: buildVm([]) }), { status: 200 });
    });
}

describe("familyWorkspace activity_embed thread switching", () => {
    beforeEach(() => {
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
        seedCaches();
        fetchMock.mockReset();
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

    it("keeps selected thread when switching topic A → B and only enters New Message on + New", async () => {
        const el = render(
            <FamilyCommunicationWorkspace
                entity={{ entityType: "opportunities", entityId: "opp-1" }}
                surfaceVariant="activity_embed"
            />,
        );

        await flush();
        await flush();

        expect(el.textContent).toContain("Alpha thread message");
        expect(el.querySelector('[data-cc-reply-collapsed]')).toBeTruthy();
        expect(el.querySelector('[data-cc-thread-header-summary]')).toBeTruthy();

        const threadBButton = el.querySelector('[data-cc-thread-chip="t-b"]') as HTMLButtonElement;
        expect(threadBButton).toBeTruthy();

        await act(async () => {
            threadBButton.click();
            await Promise.resolve();
            await Promise.resolve();
        });
        await flush();

        expect(el.textContent).toContain("Beta thread message");
        expect(el.textContent).not.toMatch(/^\s*New Message\s*$/m);
        expect(el.querySelector('[data-cc-thread-header-summary]')).toBeTruthy();
        expect(el.querySelector('[data-cc-reply-collapsed]')).toBeTruthy();
        expect(el.querySelector('[data-cc-new-message]')?.getAttribute("aria-pressed")).not.toBe("true");

        const newButton = el.querySelector('[data-cc-new-message]') as HTMLButtonElement;
        await act(async () => {
            newButton.click();
            await Promise.resolve();
        });
        await flush();

        expect(el.textContent).toContain("New Message");
        expect(el.querySelector('[data-cc-new-message]')?.getAttribute("aria-pressed")).toBe("true");
    });

    it("ignores stale thread A revalidation after topic B is selected", async () => {
        installDelayedFetchMock();

        const el = render(
            <FamilyCommunicationWorkspace
                entity={{ entityType: "opportunities", entityId: "opp-1" }}
                surfaceVariant="activity_embed"
            />,
        );

        await flush();
        await flush();

        expect(el.textContent).toContain("Alpha thread message");

        const threadBButton = el.querySelector('[data-cc-thread-chip="t-b"]') as HTMLButtonElement;
        await act(async () => {
            threadBButton.click();
            await Promise.resolve();
        });
        await flush();

        expect(el.textContent).toContain("Beta thread message");

        await act(async () => {
            await new Promise((r) => setTimeout(r, 350));
        });
        await flush();

        expect(el.textContent).toContain("Beta thread message");
        expect(el.textContent).not.toContain("Alpha thread message LATE");
        expect(el.querySelector('[data-cc-thread-header-summary]')).toBeTruthy();
        expect(el.querySelector('[data-cc-new-message]')?.getAttribute("aria-pressed")).not.toBe("true");
    });
});
