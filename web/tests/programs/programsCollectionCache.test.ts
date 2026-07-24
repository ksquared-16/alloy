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

    it("caches a valid empty collection without treating it as unavailable", async () => {
        const fetchMock = vi.fn(async () => {
            return new Response(
                JSON.stringify({
                    capabilities: { canManage: true },
                    programs: [],
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
        const first = await loadProgramsCollection(orgA);
        expect(first.snapshot.programs).toEqual([]);
        const second = await loadProgramsCollection(orgA);
        expect(second.meta.cacheHit).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(peekProgramsCollection(orgA)?.programs).toEqual([]);
    });

    it("does not classify request failures as an empty collection", async () => {
        const fetchMock = vi.fn(async () => {
            return new Response(
                JSON.stringify({
                    error: {
                        code: "action_failed",
                        title: "The Configuration action could not be completed",
                        message: "Your changes were not applied.",
                        nextStep: "Review the requested change and try again.",
                        reference: "cfg-fail",
                    },
                }),
                { status: 500, headers: { "Content-Type": "application/json" } },
            );
        });
        vi.stubGlobal("fetch", fetchMock);
        await expect(loadProgramsCollection(orgA)).rejects.toMatchObject({
            name: "ConfigurationRuntimeIssueError",
            issue: { code: "action_failed" },
        });
        expect(peekProgramsCollection(orgA)).toBeNull();
    });

    it("does not classify missing-table failures as an empty collection", async () => {
        const fetchMock = vi.fn(async () => {
            return new Response(
                JSON.stringify({
                    error: {
                        code: "not_initialized",
                        title: "Programs setup is not complete",
                        message: "This Configuration area has not been initialized in this environment.",
                        nextStep: "An administrator needs to complete platform setup before this configuration can be used.",
                        reference: "cfg-missing",
                    },
                }),
                { status: 503, headers: { "Content-Type": "application/json" } },
            );
        });
        vi.stubGlobal("fetch", fetchMock);
        await expect(loadProgramsCollection(orgA)).rejects.toMatchObject({
            name: "ConfigurationRuntimeIssueError",
            issue: { code: "not_initialized" },
        });
        expect(peekProgramsCollection(orgA)).toBeNull();
    });
});
