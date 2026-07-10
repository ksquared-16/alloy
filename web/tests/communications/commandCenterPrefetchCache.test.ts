import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/communications/v2/flags", () => ({
    isCommsV2FlagEnabled: (key: string) =>
        key === "comms_v2_command_center" || key === "comms_v2_live_workspace",
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import {
    getCommandCenterFirstConversationWarm,
    getCommandCenterCacheSnapshot,
    prefetchCommandCenterConversations,
    resetCommandCenterPrefetchCacheForTests,
    resolveCommandCenterWarmSelection,
    warmCommandCenterModal,
} from "@/lib/communications/v2/commandCenterPrefetchCache";
import { resetDrawerFamilyWorkspacePrefetchCacheForTests } from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchCache";
import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";

const sampleConversations: ConversationSummary[] = [
    {
        id: "conv-1",
        customer_id: "cust-1",
        family_label: "Nguyen Family",
        channel: "email",
        attention_state: "awaiting_parent_reply",
        unread: 1,
    } as ConversationSummary,
];

describe("commandCenterPrefetchCache", () => {
    beforeEach(() => {
        resetCommandCenterPrefetchCacheForTests();
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
        fetchMock.mockReset();
        fetchMock.mockImplementation(async (url: string) => {
            if (url.includes("/communications/conversations")) {
                return new Response(JSON.stringify({ conversations: sampleConversations }), { status: 200 });
            }
            if (url.includes("/family-workspace")) {
                return new Response(
                    JSON.stringify({
                        workspace: {
                            children: [{ name: "Ava" }],
                            recipientGroups: [],
                            selectedRecipients: ["person-1"],
                            messages: [{ id: "m1", body: "Hello", createdAt: "2026-01-01T00:00:00Z", threadId: "conv-1" }],
                            timelineEvents: [{ id: "m1", body: "Hello", createdAt: "2026-01-01T00:00:00Z" }],
                        },
                    }),
                    { status: 200 }
                );
            }
            return new Response("{}", { status: 404 });
        });
    });

    afterEach(() => {
        resetCommandCenterPrefetchCacheForTests();
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
    });

    it("resolveCommandCenterWarmSelection picks first visible conversation", () => {
        const id = resolveCommandCenterWarmSelection(sampleConversations);
        expect(id).toBe("conv-1");
    });

    it("dedupes concurrent warm loads", async () => {
        const [a, b] = await Promise.all([warmCommandCenterModal(), warmCommandCenterModal()]);
        expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/conversations"))).toHaveLength(1);
        expect(a.conversations).toEqual(b.conversations);
    });

    it("warms first conversation workspace after queue load", async () => {
        await prefetchCommandCenterConversations();
        const warm = getCommandCenterFirstConversationWarm();
        expect(warm?.conversationId).toBe("conv-1");
        expect(warm?.workspace?.messages?.[0]?.body ?? warm?.threadMessages?.[0]?.body).toBe("Hello");
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/family-workspace") && String(c[0]).includes("thread_id"))).toBe(true);
    });

    it("reuses in-flight warm when modal opens before completion", async () => {
        const inflight = warmCommandCenterModal();
        const reuse = warmCommandCenterModal();
        await Promise.all([inflight, reuse]);
        expect(getCommandCenterCacheSnapshot()?.conversations).toHaveLength(1);
        expect(getCommandCenterFirstConversationWarm()?.conversationId).toBe("conv-1");
    });
});
