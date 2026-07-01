import { describe, expect, it } from "vitest";
import {
    workUnitKeyToRouteSlug,
    workUnitRouteSlugToKey,
    workUnitRouteSlugsEquivalent,
} from "@/lib/admin/workUnitRouteSlug";

describe("workUnitRouteSlug", () => {
    it("maps platform keys to hyphen slugs", () => {
        expect(workUnitKeyToRouteSlug("new_leads")).toBe("new-leads");
        expect(workUnitKeyToRouteSlug("enrollment_pipeline")).toBe("enrollment-pipeline");
    });

    it("round-trips slug to key", () => {
        expect(workUnitRouteSlugToKey("new-leads")).toBe("new_leads");
    });

    it("compares slugs by platform key", () => {
        expect(workUnitRouteSlugsEquivalent("new-leads", "new_leads")).toBe(true);
    });
});
