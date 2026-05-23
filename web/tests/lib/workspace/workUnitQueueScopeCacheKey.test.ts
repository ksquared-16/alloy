import { describe, expect, it } from "vitest";

import {
    buildWorkUnitBootstrapLoaderCacheKey,
    buildWorkUnitQueueScopeCacheKey,
    wuBootstrapCacheKeyDigest,
} from "@/lib/workspace/workUnitQueueScopeCacheKey";

const dim = {
    departmentScope: "all" as const,
    allowedDepartmentIds: null,
    siteScope: "all" as const,
    allowedSiteLocationIds: null,
};

describe("workUnitQueueScopeCacheKey", () => {
    it("scope key is stable regardless of constraint object identity", () => {
        const a = buildWorkUnitQueueScopeCacheKey({
            accessDim: dim,
            workspaceSiteId: null,
            recordScopeImpossible: false,
        });
        const b = buildWorkUnitQueueScopeCacheKey({
            accessDim: dim,
            workspaceSiteId: null,
            recordScopeImpossible: false,
        });
        expect(a).toBe(b);
    });

    it("view site changes scope key", () => {
        const all = buildWorkUnitQueueScopeCacheKey({
            accessDim: dim,
            workspaceSiteId: null,
            recordScopeImpossible: false,
        });
        const site = buildWorkUnitQueueScopeCacheKey({
            accessDim: dim,
            workspaceSiteId: "site-abc",
            recordScopeImpossible: false,
        });
        expect(all).not.toBe(site);
    });

    it("loader cache key matches canonical bootstrap URL params", () => {
        const scope = buildWorkUnitQueueScopeCacheKey({
            accessDim: dim,
            workspaceSiteId: "site-1",
            recordScopeImpossible: false,
        });
        const k1 = buildWorkUnitBootstrapLoaderCacheKey({
            orgId: "org-1",
            departmentId: "dept-1",
            workUnitId: "wu-1",
            queueScopeKey: scope,
            summariesLimit: 3,
            summariesModeKey: "priority:6",
            primaryRowLimit: 8,
            omitTotalCount: true,
            focusQueue: "",
            attentionBucketKey: "",
            deferPrimaryLaneRows: false,
            viewerTimezoneIana: "America/New_York",
        });
        const k2 = buildWorkUnitBootstrapLoaderCacheKey({
            orgId: "org-1",
            departmentId: "dept-1",
            workUnitId: "wu-1",
            queueScopeKey: scope,
            summariesLimit: 3,
            summariesModeKey: "priority:6",
            primaryRowLimit: 8,
            omitTotalCount: true,
            focusQueue: "",
            attentionBucketKey: "",
            deferPrimaryLaneRows: false,
            viewerTimezoneIana: "America/New_York",
        });
        expect(k1).toBe(k2);
        expect(wuBootstrapCacheKeyDigest(k1)).toBe(wuBootstrapCacheKeyDigest(k2));
    });

    it("prefetch vs reveal differ when focus_queue is present in URL only", () => {
        const scope = buildWorkUnitQueueScopeCacheKey({
            accessDim: dim,
            workspaceSiteId: null,
            recordScopeImpossible: false,
        });
        const canonical = buildWorkUnitBootstrapLoaderCacheKey({
            orgId: "o",
            departmentId: "d",
            workUnitId: "w",
            queueScopeKey: scope,
            summariesLimit: 3,
            summariesModeKey: "priority:6",
            primaryRowLimit: 8,
            omitTotalCount: true,
            focusQueue: "",
            attentionBucketKey: "",
            deferPrimaryLaneRows: false,
            viewerTimezoneIana: "UTC",
        });
        const withFocus = buildWorkUnitBootstrapLoaderCacheKey({
            orgId: "o",
            departmentId: "d",
            workUnitId: "w",
            queueScopeKey: scope,
            summariesLimit: 3,
            summariesModeKey: "priority:6",
            primaryRowLimit: 8,
            omitTotalCount: true,
            focusQueue: "pipeline",
            attentionBucketKey: "",
            deferPrimaryLaneRows: false,
            viewerTimezoneIana: "UTC",
        });
        expect(canonical).not.toBe(withFocus);
    });
});
