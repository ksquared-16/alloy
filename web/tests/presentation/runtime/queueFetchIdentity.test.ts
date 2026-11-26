import { describe, expect, it } from "vitest";

import { workUnitQueueFetchIdentity } from "@/lib/presentation/runtime/workUnitSurfaceSeed";

const base = {
    orgId: "org-1",
    scopeFingerprint: "scope-1",
    workUnitId: "wu-1",
    fetchQueueKey: "lifecycle_lead",
    workViewId: "view-1",
    selectedSiteId: null as string | null,
    refreshNonce: 0 as string | number,
};

describe("workUnitQueueFetchIdentity — one active-queue request per scope", () => {
    it("is stable across cosmetic cacheContext churn (same org/scope/view/site/queue/nonce)", () => {
        // The deployed 3x duplicate: cacheContext object reference changed but the scope did not.
        expect(workUnitQueueFetchIdentity(base)).toBe(workUnitQueueFetchIdentity({ ...base }));
    });

    it("changes on a genuine scope change so a real refetch still fires", () => {
        const id = workUnitQueueFetchIdentity(base);
        expect(workUnitQueueFetchIdentity({ ...base, workViewId: "view-2" })).not.toBe(id);
        expect(workUnitQueueFetchIdentity({ ...base, selectedSiteId: "site-2" })).not.toBe(id);
        expect(workUnitQueueFetchIdentity({ ...base, fetchQueueKey: "waitlist" })).not.toBe(id);
        expect(workUnitQueueFetchIdentity({ ...base, refreshNonce: 1 })).not.toBe(id); // mutation
    });

    it("preserves tenant isolation — org / access-scope change refetches", () => {
        const id = workUnitQueueFetchIdentity(base);
        expect(workUnitQueueFetchIdentity({ ...base, orgId: "org-2" })).not.toBe(id);
        expect(workUnitQueueFetchIdentity({ ...base, scopeFingerprint: "scope-2" })).not.toBe(id);
    });

    it("null site / view normalize consistently (no distinct-but-equivalent entries)", () => {
        expect(workUnitQueueFetchIdentity({ ...base, selectedSiteId: null })).toBe(
            workUnitQueueFetchIdentity({ ...base, selectedSiteId: undefined }),
        );
        expect(workUnitQueueFetchIdentity({ ...base, workViewId: null })).toBe(
            workUnitQueueFetchIdentity({ ...base, workViewId: undefined }),
        );
    });
});
