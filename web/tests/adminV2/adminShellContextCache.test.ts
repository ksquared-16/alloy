import { describe, expect, it, beforeEach } from "vitest";

import {
    buildAdminShellContextCacheKey,
    invalidateAdminShellContextCache,
    readAdminShellContextCache,
    resetAdminShellContextCacheForTests,
    writeAdminShellContextCache,
} from "@/lib/adminV2/adminShellContextCache";
import {
    invalidateEntityLabelsOrgCache,
    readEntityLabelsOrgCache,
    resetEntityLabelsOrgCacheForTests,
    writeEntityLabelsOrgCache,
} from "@/lib/admin/entityLabelsOrgCache";
import type { AdminAccessBundle } from "@/lib/admin/getAdminAccessContext";
import type { EntityLabelsPayload } from "@/lib/admin/entityLabelsResolve";

function sampleBundle(overrides: Partial<AdminAccessBundle & { ok: true }> = {}): AdminAccessBundle & { ok: true } {
    return {
        ok: true,
        userId: "user-1",
        orgId: "org-1",
        roleKeys: ["admin"],
        permissionKeys: ["admin.read"],
        departmentScope: "all",
        allowedDepartmentIds: null,
        siteScope: "all",
        allowedSiteLocationIds: null,
        portalEligible: true,
        ...overrides,
    };
}

const sampleLabels: EntityLabelsPayload = {
    org_industry_id: "ind-1",
    industry: { key: "childcare", label: "Childcare" },
    defaults: [],
    overrides: [],
    effective: [],
};

describe("admin shell context cache", () => {
    beforeEach(() => {
        resetAdminShellContextCacheForTests();
    });

    it("builds distinct keys when scope dimensions differ", () => {
        const base = {
            userId: "u1",
            orgId: "o1",
            roleKeys: ["admin"],
        };
        const all = buildAdminShellContextCacheKey({
            ...base,
            departmentScope: "all",
            siteScope: "all",
            allowedDepartmentIds: null,
            allowedSiteLocationIds: null,
        });
        const restricted = buildAdminShellContextCacheKey({
            ...base,
            departmentScope: "restricted",
            siteScope: "restricted",
            allowedDepartmentIds: ["d2", "d1"],
            allowedSiteLocationIds: ["s1"],
        });
        expect(all).not.toBe(restricted);
    });

    it("returns warm bundle after write and clears on user invalidation", () => {
        const bundle = sampleBundle();
        writeAdminShellContextCache(bundle);
        expect(readAdminShellContextCache("user-1")?.orgId).toBe("org-1");
        invalidateAdminShellContextCache("user-1");
        expect(readAdminShellContextCache("user-1")).toBeNull();
    });

    it("does not serve another user's cached bundle", () => {
        writeAdminShellContextCache(sampleBundle({ userId: "user-a" }));
        expect(readAdminShellContextCache("user-b")).toBeNull();
    });
});

describe("entity labels org cache", () => {
    beforeEach(() => {
        resetEntityLabelsOrgCacheForTests();
    });

    it("round-trips payload until invalidated", () => {
        writeEntityLabelsOrgCache("org-1", sampleLabels);
        expect(readEntityLabelsOrgCache("org-1")?.industry?.key).toBe("childcare");
        invalidateEntityLabelsOrgCache("org-1");
        expect(readEntityLabelsOrgCache("org-1")).toBeNull();
    });
});
