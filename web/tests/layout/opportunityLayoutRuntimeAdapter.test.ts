/**
 * OpportunityLayoutRuntimeAdapter — VM→refKey projection + per-open cache.
 */

import { describe, expect, it } from "vitest";
import {
    adaptOpportunityVmToLayoutRuntimeRecord,
    computeOpportunityAdapterCacheKey,
    createOpportunityLayoutRuntimeAdapter,
} from "@/lib/layout/runtime/OpportunityLayoutRuntimeAdapter";

const baseVm = {
    name: "Johnson Family",
    status_key: "qualified",
    _status_display: "Qualified",
    updated_at: "2026-06-01T00:00:00Z",
    _primary_contact_name: "Jamie Johnson",
    _primary_contact_phone: "(555) 234-8901",
    _inquiry_children: [{ id: "row-1", display_name: "Alex Johnson", updated_at: "2026-06-01T00:00:00Z" }],
};

describe("adaptOpportunityVmToLayoutRuntimeRecord", () => {
    it("maps contact=Person and children=enrollment context", () => {
        const record = adaptOpportunityVmToLayoutRuntimeRecord({
            vmRecord: baseVm,
            opportunityId: "opp-1",
            statusDisplay: "Qualified",
        });
        expect(record["person.primary_contact_name"]).toBe("Jamie Johnson");
        expect(record._relations?.primary_contact?.entityType).toBe("person");
        const children = record.enrollment_children;
        expect(Array.isArray(children) && children[0]?.["child.name"]).toBe("Alex Johnson");
    });
});

describe("computeOpportunityAdapterCacheKey", () => {
    it("is stable for identical input and changes when status or roster changes", () => {
        const a = computeOpportunityAdapterCacheKey({ vmRecord: baseVm, opportunityId: "opp-1", statusDisplay: "Qualified" });
        const same = computeOpportunityAdapterCacheKey({ vmRecord: baseVm, opportunityId: "opp-1", statusDisplay: "Qualified" });
        expect(same).toBe(a);

        const statusChanged = computeOpportunityAdapterCacheKey({
            vmRecord: { ...baseVm, status_key: "enrolled", _status_display: "Enrolled" },
            opportunityId: "opp-1",
            statusDisplay: "Enrolled",
        });
        expect(statusChanged).not.toBe(a);

        const rosterChanged = computeOpportunityAdapterCacheKey({
            vmRecord: { ...baseVm, _inquiry_children: [] },
            opportunityId: "opp-1",
            statusDisplay: "Qualified",
        });
        expect(rosterChanged).not.toBe(a);
    });
});

describe("createOpportunityLayoutRuntimeAdapter", () => {
    it("returns the cached projection until the key changes", () => {
        const adapter = createOpportunityLayoutRuntimeAdapter();
        const first = adapter.adapt({ vmRecord: baseVm, opportunityId: "opp-1", statusDisplay: "Qualified" });
        const second = adapter.adapt({ vmRecord: baseVm, opportunityId: "opp-1", statusDisplay: "Qualified" });
        expect(second).toBe(first); // same reference — cache hit

        const third = adapter.adapt({
            vmRecord: { ...baseVm, status_key: "enrolled", _status_display: "Enrolled" },
            opportunityId: "opp-1",
            statusDisplay: "Enrolled",
        });
        expect(third).not.toBe(first); // recomputed on change

        adapter.reset();
        const afterReset = adapter.adapt({ vmRecord: baseVm, opportunityId: "opp-1", statusDisplay: "Qualified" });
        expect(afterReset).not.toBe(first);
    });
});
