import { describe, expect, it } from "vitest";
import { resolveOrgSiteLocationsForAdmin } from "@/lib/admin/resolveOrgSiteLocations";

describe("resolveOrgSiteLocationsForAdmin", () => {
    it("filters to allowed site ids when restricted", async () => {
        const supabase = {
            from: () => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            or: () => ({
                                order: () => ({
                                    limit: async () => ({
                                        data: [
                                            { id: "a", label: "North Campus" },
                                            { id: "b", label: "South Campus" },
                                            { id: "c", label: "West Campus" },
                                        ],
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    }),
                }),
            }),
        };

        const sites = await resolveOrgSiteLocationsForAdmin(supabase as never, "org", {
            allowedSiteLocationIds: ["a", "c"],
        });

        expect(sites.map((s) => s.label)).toEqual(["North Campus", "West Campus"]);
    });
});
