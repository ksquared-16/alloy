import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { WORKSPACE_SITE_QUERY_PARAM } from "@/lib/admin/resolveQueueRecordScopeConstraints";
import {
    appendWorkspaceSiteToPath,
    appendWorkspaceSiteToUrl,
    clearWorkspaceSiteSession,
    isAllowedWorkspaceSiteId,
    isWorkspaceAreaPath,
    readStickyWorkspaceSiteIdForNavigation,
    readWorkspaceSiteFromLocationSearch,
    readWorkspaceSiteSession,
    registerWorkspaceSiteFilterPersistenceScope,
    resolveStickyWorkspaceSiteId,
    setLiveStickyWorkspaceSiteId,
    writeWorkspaceSiteSession,
    workspaceViewCacheFingerprint,
} from "@/lib/adminV2/workspaceSiteFilterClient";

const SCOPE = {
    orgId: "org-1",
    principalUserId: "user-1",
    accessScopeFingerprint: "scope:abc",
};

describe("workspaceSiteFilterClient", () => {
    const sessionStore: Record<string, string> = {};
    const mockSessionStorage = {
        getItem(k: string) {
            return sessionStore[k] ?? null;
        },
        setItem(k: string, v: string) {
            sessionStore[k] = v;
        },
        removeItem(k: string) {
            delete sessionStore[k];
        },
    };

    beforeEach(() => {
        registerWorkspaceSiteFilterPersistenceScope(SCOPE);
        setLiveStickyWorkspaceSiteId(null);
        Object.keys(sessionStore).forEach((k) => delete sessionStore[k]);
        vi.stubGlobal("sessionStorage", mockSessionStorage);
        vi.stubGlobal("window", {
            sessionStorage: mockSessionStorage,
            location: { pathname: "/adminV2/workspace", search: "", hash: "" },
            history: { replaceState: vi.fn() },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        registerWorkspaceSiteFilterPersistenceScope({
            orgId: null,
            principalUserId: null,
            accessScopeFingerprint: "scope:unknown",
        });
        setLiveStickyWorkspaceSiteId(null);
    });

    it("isWorkspaceAreaPath matches workspace routes only", () => {
        expect(isWorkspaceAreaPath("/adminV2/workspace")).toBe(true);
        expect(isWorkspaceAreaPath("/adminV2/workspace/dept/d1")).toBe(true);
        expect(isWorkspaceAreaPath("/admin/v2/workspace/dept/d1")).toBe(true);
        expect(isWorkspaceAreaPath("/adminV2/settings")).toBe(false);
    });

    it("appendWorkspaceSiteToPath merges and preserves queue param", () => {
        const base = "/adminV2/workspace/dept/d1/work-unit/w1?queue=needs_attention";
        expect(appendWorkspaceSiteToPath(base, "site-a")).toBe(
            `/adminV2/workspace/dept/d1/work-unit/w1?queue=needs_attention&${WORKSPACE_SITE_QUERY_PARAM}=site-a`
        );
    });

    it("appendWorkspaceSiteToPath removes site param when cleared", () => {
        const base = `/adminV2/workspace?${WORKSPACE_SITE_QUERY_PARAM}=site-a&queue=x`;
        expect(appendWorkspaceSiteToPath(base, null)).toBe("/adminV2/workspace?queue=x");
    });

    it("appendWorkspaceSiteToPath preserves hash", () => {
        expect(appendWorkspaceSiteToPath("/adminV2/workspace#pane", "site-a")).toBe(
            `/adminV2/workspace?${WORKSPACE_SITE_QUERY_PARAM}=site-a#pane`
        );
    });

    it("appendWorkspaceSiteToPath leaves non-workspace paths unchanged", () => {
        expect(appendWorkspaceSiteToPath("/adminV2/settings/fields", "site-a")).toBe("/adminV2/settings/fields");
    });

    it("readWorkspaceSiteFromLocationSearch parses workspace_site_id", () => {
        expect(readWorkspaceSiteFromLocationSearch(`?${WORKSPACE_SITE_QUERY_PARAM}=site-1`)).toBe("site-1");
        expect(readWorkspaceSiteFromLocationSearch("")).toBeNull();
    });

    it("resolveStickyWorkspaceSiteId prefers URL over session", () => {
        const allowed = [{ id: "site-a" }, { id: "site-b" }];
        expect(
            resolveStickyWorkspaceSiteId({
                urlSiteId: "site-a",
                sessionSiteId: "site-b",
                allowedSites: allowed,
            })
        ).toBe("site-a");
        expect(
            resolveStickyWorkspaceSiteId({
                urlSiteId: "bad",
                sessionSiteId: "site-b",
                allowedSites: allowed,
            })
        ).toBe("site-b");
        expect(
            resolveStickyWorkspaceSiteId({
                urlSiteId: "bad",
                sessionSiteId: "also-bad",
                allowedSites: allowed,
            })
        ).toBeNull();
    });

    it("session read/write/clear round-trip", () => {
        writeWorkspaceSiteSession(SCOPE, "site-x");
        expect(readWorkspaceSiteSession(SCOPE)).toBe("site-x");
        clearWorkspaceSiteSession(SCOPE);
        expect(readWorkspaceSiteSession(SCOPE)).toBeNull();
    });

    it("readStickyWorkspaceSiteIdForNavigation uses explicit site when provided", () => {
        expect(readStickyWorkspaceSiteIdForNavigation({ explicitSiteId: "site-z" })).toBe("site-z");
        expect(readStickyWorkspaceSiteIdForNavigation({ explicitSiteId: null })).toBeNull();
    });

    it("readStickyWorkspaceSiteIdForNavigation falls back to live sticky", () => {
        setLiveStickyWorkspaceSiteId("site-live");
        expect(readStickyWorkspaceSiteIdForNavigation()).toBe("site-live");
    });

    it("appendWorkspaceSiteToUrl and fingerprint unchanged behavior", () => {
        expect(appendWorkspaceSiteToUrl("/api/admin/queues/wu/pipeline?limit=20", "site-a")).toContain(
            `${WORKSPACE_SITE_QUERY_PARAM}=site-a`
        );
        expect(workspaceViewCacheFingerprint("scope:abc", "site-a")).toBe("scope:abc;view:site-a");
    });

    it("isAllowedWorkspaceSiteId checks allowed list", () => {
        expect(isAllowedWorkspaceSiteId("site-a", [{ id: "site-a" }])).toBe(true);
        expect(isAllowedWorkspaceSiteId("site-z", [{ id: "site-a" }])).toBe(false);
    });
});
