import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    invalidateLocationConcernCaches,
    loadLocationAccessMembers,
    loadLocationOwnedSetup,
    loadLocationPlacementPolicy,
    loadLocationTourRules,
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

    /*
     * D-T6, as decided. The S3 contract (e637db1f1) inherited organization-wide rules into every location; the
     * user-authorized Tours feedback of 2026-10-29 20:09 UTC (sprint OPWORK_2CEA84351D90_SPRINT_EB9A9359C92B,
     * slice tours-feedback-location-only 4c816888b) made Tours location-specific, and aa1cf6b05 states it for this
     * cache: "the location concern cache return[s] own rules only". Legacy organization-wide rules stay stored;
     * they neither appear here nor make a location configured.
     */
    it("D-T6: a location's tour rules are its own; legacy organization-wide rules neither appear nor configure it", async () => {
        const rulesResponse = (rules: unknown[]) => vi.fn(async () =>
            new Response(JSON.stringify({ rules }), { status: 200, headers: { "Content-Type": "application/json" } }));

        vi.stubGlobal("fetch", rulesResponse([
            { id: "org-wide", location_id: null, is_active: true },
            { id: "elsewhere", location_id: "site-other", is_active: true },
        ]));
        const legacyOnly = await loadLocationTourRules(orgId, locationId);
        expect(legacyOnly.snapshot.rules.map((r) => r.id)).toEqual([]);
        // No schedule of its own: the location is not configured for tours, whatever the organization holds.
        const legacySetup = await loadLocationOwnedSetup(orgId, locationId, { force: true });
        expect(legacySetup.snapshot.toursConfigured).toBe(false);

        resetLocationConcernCachesForTests();
        vi.stubGlobal("fetch", rulesResponse([
            { id: "org-wide", location_id: null, is_active: true },
            { id: "own", location_id: locationId, is_active: true },
            { id: "elsewhere", location_id: "site-other", is_active: true },
        ]));
        const own = await loadLocationTourRules(orgId, locationId);
        expect(own.snapshot.rules.map((r) => r.id)).toEqual(["own"]);
        const ownSetup = await loadLocationOwnedSetup(orgId, locationId, { force: true });
        expect(ownSetup.snapshot.toursConfigured).toBe(true);
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
