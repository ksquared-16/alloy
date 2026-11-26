import { describe, expect, it } from "vitest";

import { surfaceRefFromPath } from "@/lib/experience/surfaceHost/surfaceRef";
import { surfaceHostShouldRenderWorkUnit } from "@/lib/experience/surfaceHost/surfaceHostRender";

/**
 * Canonical (no flag): the Surface Host renders the work-unit surface whenever the URL is a work
 * unit — and never for the workspace URL. This is the single render decision; the route is
 * seed-only, so exactly one controller runs.
 */
describe("surfaceHostShouldRenderWorkUnit", () => {
    it("renders the work-unit surface on a work-unit URL", () => {
        expect(surfaceHostShouldRenderWorkUnit(surfaceRefFromPath("/workspace/work-unit/active-pipeline"))).toBe(true);
    });

    it("renders it on a record deep link too (record is intra-surface)", () => {
        expect(
            surfaceHostShouldRenderWorkUnit(surfaceRefFromPath("/workspace/work-unit/active-pipeline/opp-1")),
        ).toBe(true);
    });

    it("does NOT render the work-unit surface on the workspace URL", () => {
        expect(surfaceHostShouldRenderWorkUnit(surfaceRefFromPath("/workspace"))).toBe(false);
    });

    it("does NOT render for a non-operator path", () => {
        expect(surfaceHostShouldRenderWorkUnit(surfaceRefFromPath("/adminV2/settings/fields"))).toBe(false);
    });
});
