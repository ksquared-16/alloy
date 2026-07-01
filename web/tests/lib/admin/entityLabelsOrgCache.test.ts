import { describe, expect, it, beforeEach, vi } from "vitest";

import {
    invalidateEntityLabelsOrgCache,
    readEntityLabelsOrgCache,
    resetEntityLabelsOrgCacheForTests,
    writeEntityLabelsOrgCache,
} from "@/lib/admin/entityLabelsOrgCache";
import { resolveEntityLabelsForOrgCached } from "@/lib/admin/entityLabelsResolve";

const samplePayload = {
    org_industry_id: "ind-1",
    industry: { key: "childcare", label: "Childcare" },
    defaults: [{ entity_type: "opportunities", singular: "Opportunity", plural: "Opportunities" }],
    overrides: [],
    effective: [{ entity_type: "opportunities", singular: "Opportunity", plural: "Opportunities" }],
};

describe("entity labels org cache", () => {
    beforeEach(() => {
        resetEntityLabelsOrgCacheForTests();
        vi.restoreAllMocks();
    });

    it("process cache hit avoids resolve on second call", async () => {
        writeEntityLabelsOrgCache("org-1", samplePayload);
        expect(readEntityLabelsOrgCache("org-1")?.effective[0]?.singular).toBe("Opportunity");

        const resolveSpy = vi.fn();
        const payload = await resolveEntityLabelsForOrgCached(
            { from: resolveSpy } as never,
            "org-1"
        );
        expect(payload.effective[0]?.singular).toBe("Opportunity");
        expect(resolveSpy).not.toHaveBeenCalled();
    });

    it("invalidate clears process cache", () => {
        writeEntityLabelsOrgCache("org-1", samplePayload);
        invalidateEntityLabelsOrgCache("org-1");
        expect(readEntityLabelsOrgCache("org-1")).toBeNull();
    });
});
