import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    invalidateLocationsCollection,
    loadLocationsCollection,
    peekLocationsCollection,
    resetLocationsCollectionCacheForTests,
} from "@/lib/locations/locationsCollectionCache";
import {
    resetConfigurationInvalidationForTests,
    subscribeConfigurationInvalidation,
} from "@/lib/configRuntime/configurationInvalidation";

const orgA = "org-aaa";
const orgB = "org-bbb";

function mockCollectionApis(overrides?: { schedulePatterns?: unknown[] }) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/admin/locations")) {
            return new Response(JSON.stringify({ locations: [{ id: "site-1", location_type: "site" }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }
        if (url.includes("/api/admin/location-program-categories") || url.includes("program-categories")) {
            return new Response(JSON.stringify({ categories: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }
        if (url.includes("/api/admin/schedule-patterns")) {
            return new Response(
                JSON.stringify({
                    patterns: overrides?.schedulePatterns ?? [{ id: "pat-1", site_location_id: "site-1" }],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        }
        return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

beforeEach(() => {
    resetLocationsCollectionCacheForTests();
    resetConfigurationInvalidationForTests();
});

afterEach(() => {
    vi.unstubAllGlobals();
    resetLocationsCollectionCacheForTests();
    resetConfigurationInvalidationForTests();
});

describe("Locations collection cache", () => {
    it("reuses inflight requests for the same org", async () => {
        const fetchMock = mockCollectionApis();
        const [ra, rb] = await Promise.all([loadLocationsCollection(orgA), loadLocationsCollection(orgA)]);
        expect(ra.snapshot.rows).toEqual(rb.snapshot.rows);
        expect(ra.meta.inflightJoin || rb.meta.inflightJoin).toBe(true);
        const scheduleCalls = fetchMock.mock.calls.filter(([url]) =>
            String(url).includes("/api/admin/schedule-patterns"),
        );
        expect(scheduleCalls).toHaveLength(1);
        expect(scheduleCalls[0]?.[0]).toBe("/api/admin/schedule-patterns");
    });

    it("isolates cache by orgId", async () => {
        mockCollectionApis();
        await loadLocationsCollection(orgA);
        expect(peekLocationsCollection(orgA)).not.toBeNull();
        expect(peekLocationsCollection(orgB)).toBeNull();
        await loadLocationsCollection(orgB);
        invalidateLocationsCollection(orgA, "test", { publishBus: false });
        expect(peekLocationsCollection(orgA)).toBeNull();
        expect(peekLocationsCollection(orgB)).not.toBeNull();
    });

    it("returns cache hits within TTL without refetch", async () => {
        const fetchMock = mockCollectionApis();
        await loadLocationsCollection(orgA);
        const second = await loadLocationsCollection(orgA);
        expect(second.meta.cacheHit).toBe(true);
        const locationCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/admin/locations"));
        expect(locationCalls).toHaveLength(1);
    });

    it("invalidation clears cache and publishes Continuity bus by default", async () => {
        mockCollectionApis();
        await loadLocationsCollection(orgA);
        const events: string[] = [];
        const unsub = subscribeConfigurationInvalidation((e) => events.push(e.reason));
        invalidateLocationsCollection(orgA, "location-patched");
        expect(peekLocationsCollection(orgA)).toBeNull();
        expect(events).toContain("location-patched");
        unsub();
    });

    it("keeps prior snapshot peekable while a forced refresh is in flight", async () => {
        mockCollectionApis();
        await loadLocationsCollection(orgA);
        const prior = peekLocationsCollection(orgA);
        expect(prior).not.toBeNull();

        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            await gate;
            const url = String(input);
            if (url.includes("/api/admin/locations")) {
                return new Response(JSON.stringify({ locations: [{ id: "site-2", location_type: "site" }] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            if (url.includes("program")) {
                return new Response(JSON.stringify({ categories: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response(JSON.stringify({ patterns: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        const pending = loadLocationsCollection(orgA, { force: true });
        expect(peekLocationsCollection(orgA)?.rows).toEqual(prior!.rows);
        release();
        const next = await pending;
        expect(next.snapshot.rows[0]?.id).toBe("site-2");
    });
});
