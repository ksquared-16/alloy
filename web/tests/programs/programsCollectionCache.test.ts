import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    invalidateProgramsCollection,
    loadProgramsCollection,
    peekProgramsCollection,
    resetProgramsCollectionCacheForTests,
} from "@/lib/programs/programsCollectionCache";

const orgA = "org-programs-a";

function mockProgramsApi() {
    const fetchMock = vi.fn(async () => {
        return new Response(
            JSON.stringify({
                capabilities: { canManage: true },
                programs: [{ id: "program-1", key: "preschool" }],
                locations: [],
                runs: [],
                attempts: [],
                assignments: [],
                availability: [],
                offerings: [],
                variants: [],
                tuitionRates: [],
                policies: [],
                products: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

beforeEach(() => {
    resetProgramsCollectionCacheForTests();
});

afterEach(() => {
    vi.unstubAllGlobals();
    resetProgramsCollectionCacheForTests();
});

describe("Programs collection cache", () => {
    it("reuses inflight requests for the same org", async () => {
        const fetchMock = mockProgramsApi();
        const [ra, rb] = await Promise.all([loadProgramsCollection(orgA), loadProgramsCollection(orgA)]);
        expect(ra.snapshot.programs).toEqual(rb.snapshot.programs);
        expect(ra.meta.inflightJoin || rb.meta.inflightJoin).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("returns cache hits within TTL without refetch", async () => {
        const fetchMock = mockProgramsApi();
        await loadProgramsCollection(orgA);
        const second = await loadProgramsCollection(orgA);
        expect(second.meta.cacheHit).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(peekProgramsCollection(orgA)?.programs[0]?.id).toBe("program-1");
    });

    it("invalidates on demand", async () => {
        mockProgramsApi();
        await loadProgramsCollection(orgA);
        invalidateProgramsCollection(orgA, "test", { publishBus: false });
        expect(peekProgramsCollection(orgA)).toBeNull();
    });
});
