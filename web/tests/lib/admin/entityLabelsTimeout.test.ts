/**
 * Entity labels must never block Work Unit / workspace first composition (Trust Closure deployed-perf
 * fix). A slow cold industry resolve degrades to last-known/default labels within a hard timeout and
 * warms in the background; a warm process cache is served without re-resolving.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/admin/entityLabelsResolve", () => ({ resolveEntityLabelsForOrgCached: vi.fn() }));

import { resolveEntityLabelsForOrgCached } from "@/lib/admin/entityLabelsResolve";
import { loadEntityLabelsMapForOrgId } from "@/lib/admin/entityLabelsServer";

const mockResolve = vi.mocked(resolveEntityLabelsForOrgCached);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function payload(effective: Array<{ entity_type: string; singular: string; plural: string }>): any {
    return { org_industry_id: null, industry: null, defaults: [], overrides: [], effective };
}

beforeEach(() => mockResolve.mockReset());

describe("loadEntityLabelsMapForOrgId — bounded timeout + fallback", () => {
    it("does NOT block past the timeout on a slow cold resolve — returns fallback immediately", async () => {
        mockResolve.mockImplementation(
            () =>
                new Promise((r) =>
                    setTimeout(() => r(payload([{ entity_type: "opportunity", singular: "Lead", plural: "Leads" }])), 300),
                ),
        );
        const t0 = Date.now();
        const map = await loadEntityLabelsMapForOrgId("org-timeout", { timeoutMs: 40 });
        const elapsed = Date.now() - t0;
        expect(elapsed).toBeLessThan(200); // did not wait the full 300ms
        expect(map).toEqual({}); // fell back to empty (client renders defaults), never held the page
    });

    it("returns real labels when the resolve is fast", async () => {
        mockResolve.mockResolvedValue(payload([{ entity_type: "opportunity", singular: "Lead", plural: "Leads" }]));
        const map = await loadEntityLabelsMapForOrgId("org-fast", { timeoutMs: 500 });
        expect(map.opportunity).toEqual({ singular: "Lead", plural: "Leads" });
    });

    it("serves the warm process cache on a second call without re-resolving (SWR warm path)", async () => {
        mockResolve.mockResolvedValue(payload([{ entity_type: "child", singular: "Child", plural: "Children" }]));
        await loadEntityLabelsMapForOrgId("org-warm", { timeoutMs: 500 });
        mockResolve.mockClear();
        const map = await loadEntityLabelsMapForOrgId("org-warm", { timeoutMs: 500 });
        expect(mockResolve).not.toHaveBeenCalled();
        expect(map.child).toEqual({ singular: "Child", plural: "Children" });
    });

    it("a resolve returning empty effective yields an empty map (defensive)", async () => {
        mockResolve.mockResolvedValue(payload([]));
        expect(await loadEntityLabelsMapForOrgId("org-empty", { timeoutMs: 500 })).toEqual({});
    });
});
