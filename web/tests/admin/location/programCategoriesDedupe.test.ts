/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * One Household drill-in on Firefly issued
 *   GET /api/admin/location-program-categories?include_inactive=true
 * TWENTY-TWO times, byte-identical — the largest duplicate found in this sprint. The surface
 * renders many identity fields and several resolve placement options, and every mounted
 * cascade instance fetched independently because this shared helper had no dedupe.
 *
 * The fix routes it through the workspace's ESTABLISHED dedupe primitive — the same one the
 * sibling locations call in `useInquiryChildPlacementCascade` already used. No new cache.
 * Browser-verified: 23 requests -> 1.
 */
describe("location program categories — deduped through the shared primitive", () => {
    let calls: string[];
    beforeEach(() => {
        calls = [];
        vi.resetModules();
        vi.stubGlobal("fetch", ((u: RequestInfo | URL) => {
            calls.push(String(u));
            return Promise.resolve(
                new Response(JSON.stringify({ categories: [] }), { status: 200, headers: { "content-type": "application/json" } }),
            );
        }) as unknown as typeof fetch);
    });
    afterEach(() => vi.unstubAllGlobals());

    it("concurrent callers share ONE request", async () => {
        const { fetchLocationProgramCategories } = await import("@/lib/admin/location/fetchLocationProgramCategories");
        await Promise.all([
            fetchLocationProgramCategories(undefined, { includeInactive: true }),
            fetchLocationProgramCategories(undefined, { includeInactive: true }),
            fetchLocationProgramCategories(undefined, { includeInactive: true }),
        ]);
        expect(calls).toHaveLength(1);
    });

    it("a different query is a different request", async () => {
        const { fetchLocationProgramCategories } = await import("@/lib/admin/location/fetchLocationProgramCategories");
        await fetchLocationProgramCategories(undefined, { includeInactive: true });
        await fetchLocationProgramCategories(undefined, { locationId: "loc-1" });
        expect(calls).toHaveLength(2);
    });

    it("uses the established primitive rather than a new cache", () => {
        const code = readFileSync(
            join(__dirname, "..", "..", "..", "lib/admin/location/fetchLocationProgramCategories.ts"),
            "utf8",
        ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        expect(code).toContain("dedupeAdminFetchWithTtl(");
        // No bespoke Map cache in this module — the workspace primitive owns dedupe.
        expect(code).not.toContain("new Map<");
    });
});
