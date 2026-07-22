import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    invalidateLocationConcernCaches,
    loadLocationAccessMembers,
    loadLocationOwnedSetup,
    loadLocationPlacementPolicy,
    peekLocationAccessMembers,
    peekLocationOwnedSetup,
    peekLocationPlacementPolicy,
    resetLocationConcernCachesForTests,
} from "@/lib/locations/locationConcernCache";
import {
    resetConfigurationInvalidationForTests,
    subscribeConfigurationInvalidation,
} from "@/lib/configRuntime/configurationInvalidation";

const orgId = "org-c";
const locationId = "site-c";

beforeEach(() => {
    resetLocationConcernCachesForTests();
    resetConfigurationInvalidationForTests();
});

afterEach(() => {
    vi.unstubAllGlobals();
    resetLocationConcernCachesForTests();
    resetConfigurationInvalidationForTests();
});

describe("Location concern caches", () => {
    it("reuses owned-setup inflight and isolates by location", async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("availability-rules")) {
                return new Response(JSON.stringify({ rules: [{ location_id: locationId, is_active: true }] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response(
                JSON.stringify({
                    members: [{ role_keys: ["admin"], site_scope: "all", site_location_ids: [] }],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        });
        vi.stubGlobal("fetch", fetchMock);
        const [a, b] = await Promise.all([
            loadLocationOwnedSetup(orgId, locationId),
            loadLocationOwnedSetup(orgId, locationId),
        ]);
        expect(a.snapshot.toursConfigured).toBe(true);
        expect(a.inflightJoin || b.inflightJoin).toBe(true);
        expect(peekLocationOwnedSetup(orgId, "other")).toBeNull();
        expect(peekLocationOwnedSetup(orgId, locationId)).not.toBeNull();
    });

    it("caches access members and publishes Continuity invalidation", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                new Response(
                    JSON.stringify({
                        members: [
                            {
                                user_id: "u1",
                                email: "a@b.c",
                                display_name: "A",
                                role_keys: ["admin"],
                                department_scope: "all",
                                department_ids: [],
                                site_scope: "all",
                                site_location_ids: [],
                            },
                        ],
                        site_locations: [{ id: locationId }],
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                ),
            ),
        );
        await loadLocationAccessMembers(orgId, locationId);
        expect(peekLocationAccessMembers(orgId, locationId)?.authorized).toBe(true);
        const reasons: string[] = [];
        const unsub = subscribeConfigurationInvalidation((e) => reasons.push(e.reason));
        invalidateLocationConcernCaches(orgId, "access", {
            locationId,
            reason: "location-access-saved",
        });
        expect(peekLocationAccessMembers(orgId, locationId)).toBeNull();
        expect(reasons).toContain("location-access-saved");
        unsub();
    });

    it("caches placement policy at org scope", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes("work-units")) {
                    return new Response(JSON.stringify({ items: [{ id: "wu-1", key: "w", name: "Waitlist" }] }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                return new Response(JSON.stringify({ items: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }),
        );
        const first = await loadLocationPlacementPolicy(orgId);
        const second = await loadLocationPlacementPolicy(orgId);
        expect(second.cacheHit).toBe(true);
        expect(peekLocationPlacementPolicy(orgId)?.workUnits).toHaveLength(1);
        expect(first.snapshot.workUnits[0]?.id).toBe("wu-1");
    });
});
