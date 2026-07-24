import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    fetchSchedulePatternsForOrg,
    fetchSchedulePatternsForSite,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";
import {
    loadLocationsCollection,
    resetLocationsCollectionCacheForTests,
} from "@/lib/locations/locationsCollectionCache";

const root = resolve(__dirname, "../..");

afterEach(() => {
    vi.unstubAllGlobals();
    resetLocationsCollectionCacheForTests();
});

describe("Locations schedule N+1 collapse", () => {
    it("fetchSchedulePatternsForOrg issues one org-scoped GET", async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ patterns: [{ id: "p1" }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const patterns = await fetchSchedulePatternsForOrg();
        expect(patterns).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/admin/schedule-patterns");
    });

    it("collection load uses org schedule fetch, not per-site fan-out", async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/api/admin/locations")) {
                return new Response(
                    JSON.stringify({
                        locations: [
                            { id: "s1", location_type: "site" },
                            { id: "s2", location_type: "site" },
                            { id: "s3", location_type: "site" },
                        ],
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }
            if (url.includes("location-program-categories")) {
                return new Response(JSON.stringify({ categories: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            if (url.includes("/api/admin/schedule-patterns")) {
                return new Response(JSON.stringify({ patterns: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response("{}", { status: 404 });
        });
        vi.stubGlobal("fetch", fetchMock);
        await loadLocationsCollection("org-1");
        const scheduleUrls = fetchMock.mock.calls
            .map(([u]) => String(u))
            .filter((u) => u.includes("/api/admin/schedule-patterns"));
        expect(scheduleUrls).toEqual(["/api/admin/schedule-patterns"]);
        expect(scheduleUrls.some((u) => u.includes("site_location_id"))).toBe(false);
    });

    it("hook no longer fans out fetchSchedulePatternsForSite per site", () => {
        const hook = readFileSync(
            resolve(root, "components/adminV2/settings/locations/useLocationsConfigurationSettings.ts"),
            "utf8",
        );
        expect(hook).toContain("loadLocationsCollection");
        expect(hook).not.toContain("fetchSchedulePatternsForSite");
        expect(hook).not.toContain("sites.map((s) => fetchSchedulePatternsForSite");
    });

    it("site-scoped helper remains available for targeted reads", async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ patterns: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        await fetchSchedulePatternsForSite("site-1");
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain("site_location_id=site-1");
    });
});
