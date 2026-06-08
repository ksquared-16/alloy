import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import * as accessScope from "@/lib/admin/accessScope";
import {
    parseWorkspaceSiteIdFromSearchParams,
    resolveQueueRecordScopeConstraints,
    WORKSPACE_SITE_QUERY_PARAM,
} from "@/lib/admin/resolveQueueRecordScopeConstraints";
import { appendWorkspaceSiteToUrl, workspaceViewCacheFingerprint } from "@/lib/adminV2/workspaceSiteFilterClient";

function corpDim(): AdminAccessScopeDimensions {
    return {
        departmentScope: "all",
        siteScope: "all",
        allowedDepartmentIds: null,
        allowedSiteLocationIds: null,
    };
}

function restrictedSiteDim(siteIds: string[]): AdminAccessScopeDimensions {
    return {
        departmentScope: "all",
        siteScope: "restricted",
        allowedDepartmentIds: null,
        allowedSiteLocationIds: siteIds,
    };
}

describe("resolveQueueRecordScopeConstraints", () => {
    beforeEach(() => {
        vi.spyOn(accessScope, "accessScopeRestrictsData").mockReturnValue(false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("parseWorkspaceSiteIdFromSearchParams reads workspace_site_id", () => {
        const qs = new URLSearchParams({ [WORKSPACE_SITE_QUERY_PARAM]: "site-1" });
        expect(parseWorkspaceSiteIdFromSearchParams(qs)).toBe("site-1");
        expect(parseWorkspaceSiteIdFromSearchParams(new URLSearchParams())).toBeNull();
    });

    it("appendWorkspaceSiteToUrl and cache fingerprint include view site", () => {
        expect(appendWorkspaceSiteToUrl("/api/admin/queues/wu/pipeline?limit=20", "site-a")).toContain(
            "workspace_site_id=site-a"
        );
        expect(workspaceViewCacheFingerprint("scope:abc", "site-a")).toBe("scope:abc;view:site-a");
        expect(workspaceViewCacheFingerprint("scope:abc", null)).toBe("scope:abc");
    });

    it("narrows corp-all scope to selected workspace site subtree", async () => {
        vi.spyOn(accessScope, "expandLocationIdsUnderSites").mockResolvedValue(["site-root", "site-child"]);

        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn(async () => ({ data: { id: "site-root" }, error: null })),
                        })),
                    })),
                })),
            })),
        } as unknown as import("@supabase/supabase-js").SupabaseClient;

        const result = await resolveQueueRecordScopeConstraints(supabase, "org-1", corpDim(), "site-root");
        expect(result.recordScopeImpossible).toBe(false);
        expect(result.recordScopeConstraints?.locationIds).toEqual(["site-root", "site-child"]);
    });

    it("rejects workspace site outside permission allow-list", async () => {
        const supabase = {
            from: vi.fn(),
        } as unknown as import("@supabase/supabase-js").SupabaseClient;

        const result = await resolveQueueRecordScopeConstraints(
            supabase,
            "org-1",
            restrictedSiteDim(["allowed-site"]),
            "other-site"
        );
        expect(result.recordScopeImpossible).toBe(true);
        expect(result.recordScopeConstraints).toBeNull();
    });

    it("passes through when no workspace site is selected", async () => {
        const resolveSpy = vi.spyOn(accessScope, "resolveRecordScopeConstraints");
        const supabase = { from: vi.fn() } as unknown as import("@supabase/supabase-js").SupabaseClient;

        vi.spyOn(accessScope, "accessScopeRestrictsData").mockReturnValue(true);
        resolveSpy.mockResolvedValue({
            impossible: false,
            workUnitIds: null,
            locationIds: ["loc-a"],
        });

        const result = await resolveQueueRecordScopeConstraints(supabase, "org-1", corpDim(), null);
        expect(result.recordScopeImpossible).toBe(false);
        expect(result.recordScopeConstraints?.locationIds).toEqual(["loc-a"]);
    });
});
