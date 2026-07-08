import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/communications/v2/flags", () => ({
    isCommsV2FlagEnabled: (key: string) =>
        key === "comms_v2_live_workspace" || key === "comms_v2_record_tab",
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import {
    drawerFamilyWorkspaceCacheKey,
    getDrawerFamilyWorkspaceWarm,
    invalidateDrawerFamilyWorkspaceCache,
    prefetchDrawerFamilyWorkspace,
    resetDrawerFamilyWorkspacePrefetchCacheForTests,
} from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchCache";
import type { FamilyCommunicationWorkspaceVM } from "@/lib/communications/v2/familyWorkspace/types";

const sampleWorkspace = {
    family: { label: "Kurzman Family" },
    selectedRecipients: ["person-1"],
    recipientGroups: [],
    timelineEvents: [{ id: "m1", body: "Hello", createdAt: "2026-01-01T00:00:00Z" }],
} as unknown as FamilyCommunicationWorkspaceVM;

describe("drawerFamilyWorkspacePrefetchCache", () => {
    beforeEach(() => {
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
        fetchMock.mockReset();
        fetchMock.mockImplementation(async (url: string) => {
            if (String(url).includes("/family-workspace")) {
                return new Response(JSON.stringify({ workspace: sampleWorkspace }), { status: 200 });
            }
            return new Response("{}", { status: 404 });
        });
    });

    afterEach(() => {
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
    });

    it("drawerFamilyWorkspaceCacheKey scopes entity + channel", () => {
        expect(
            drawerFamilyWorkspaceCacheKey({
                entityType: "opportunities",
                entityId: "opp-1",
                composerChannel: "email",
            })
        ).toBe("entity:opportunities:opp-1:email");
        expect(
            drawerFamilyWorkspaceCacheKey({
                entityType: "opportunities",
                entityId: "opp-1",
                composerChannel: "sms",
            })
        ).toBe("entity:opportunities:opp-1:sms");
    });

    it("dedupes concurrent prefetches for the same entity", async () => {
        const params = { entityType: "opportunities", entityId: "opp-1", composerChannel: "email" as const };
        const [a, b] = await Promise.all([
            prefetchDrawerFamilyWorkspace(params),
            prefetchDrawerFamilyWorkspace(params),
        ]);
        expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/family-workspace"))).toHaveLength(1);
        expect(a?.selectedRecipients).toEqual(["person-1"]);
        expect(b?.selectedRecipients).toEqual(["person-1"]);
    });

    it("returns warm cache without refetch when fresh", async () => {
        const params = { entityType: "opportunities", entityId: "opp-1", composerChannel: "email" as const };
        await prefetchDrawerFamilyWorkspace(params);
        fetchMock.mockClear();
        const warm = getDrawerFamilyWorkspaceWarm(params);
        expect(warm?.family.label).toBe("Kurzman Family");
        await prefetchDrawerFamilyWorkspace(params);
        expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/family-workspace"))).toHaveLength(0);
    });

    it("force refresh bypasses warm cache", async () => {
        const params = { entityType: "opportunities", entityId: "opp-1", composerChannel: "email" as const };
        await prefetchDrawerFamilyWorkspace(params);
        fetchMock.mockClear();
        await prefetchDrawerFamilyWorkspace(params, { force: true });
        expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/family-workspace"))).toHaveLength(1);
    });

    it("invalidateDrawerFamilyWorkspaceCache clears entity-scoped entries", async () => {
        const emailParams = { entityType: "opportunities", entityId: "opp-1", composerChannel: "email" as const };
        const smsParams = { entityType: "opportunities", entityId: "opp-1", composerChannel: "sms" as const };
        await prefetchDrawerFamilyWorkspace(emailParams);
        await prefetchDrawerFamilyWorkspace(smsParams);
        expect(getDrawerFamilyWorkspaceWarm(emailParams)).not.toBeNull();
        invalidateDrawerFamilyWorkspaceCache({ entityType: "opportunities", entityId: "opp-1" });
        expect(getDrawerFamilyWorkspaceWarm(emailParams)).toBeNull();
        expect(getDrawerFamilyWorkspaceWarm(smsParams)).toBeNull();
    });

    it("prefetchActiveDrawerFamilyWorkspace starts fetch immediately without idle defer", async () => {
        const { prefetchActiveDrawerFamilyWorkspace } = await import(
            "@/lib/communications/v2/drawerFamilyWorkspacePrefetchCache"
        );
        prefetchActiveDrawerFamilyWorkspace("opportunities", "opp-1");
        prefetchActiveDrawerFamilyWorkspace("opportunities", "opp-1");
        await Promise.resolve();
        expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/family-workspace"))).toHaveLength(1);
    });
});
