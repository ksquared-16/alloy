import { describe, expect, it, vi } from "vitest";
import {
    buildDemoEnrollmentLeadIntakeLinkMetadata,
    readUuidOrNull,
    resolveDemoChildcareSiteLocationId,
} from "@/lib/forms/resolveDemoEnrollmentLeadTestContext";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const LIVE_LOC = "0327b715-f651-4159-868e-b4dce73eb752";
const STALE_LOC = "7ce70708-3517-4ab3-93d0-241a75ec3284";

describe("resolveDemoEnrollmentLeadTestContext", () => {
    it("readUuidOrNull rejects invalid strings", () => {
        expect(readUuidOrNull(null)).toBeNull();
        expect(readUuidOrNull("null")).toBeNull();
        expect(readUuidOrNull(LIVE_LOC)).toBe(LIVE_LOC);
    });

    it("resolveDemoChildcareSiteLocationId returns first active site", async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            eq: () => ({
                                order: () => ({
                                    limit: () => ({
                                        maybeSingle: async () => ({ data: { id: LIVE_LOC }, error: null }),
                                    }),
                                }),
                            }),
                        }),
                    }),
                }),
            })),
        };
        const id = await resolveDemoChildcareSiteLocationId(supabase as never, ORG);
        expect(id).toBe(LIVE_LOC);
    });

    it("buildDemoEnrollmentLeadIntakeLinkMetadata uses live location not stale fixture", async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            eq: () => ({
                                order: () => ({
                                    limit: () => ({
                                        maybeSingle: async () => ({ data: { id: LIVE_LOC }, error: null }),
                                    }),
                                }),
                            }),
                        }),
                    }),
                }),
            })),
        };
        const meta = await buildDemoEnrollmentLeadIntakeLinkMetadata(supabase as never, ORG);
        expect(meta.default_location_id).toBe(LIVE_LOC);
        expect(meta.default_location_id).not.toBe(STALE_LOC);
        expect(meta.lead_capture).toBe(true);
    });
});
