import { describe, expect, it } from "vitest";

import {
    isExperienceBuilderStudioActive,
    isExperienceBuilderStudioPath,
} from "@/lib/layout/experienceBuilderStudioMode";

/**
 * Guards the invariant AdminV2Shell relies on to avoid the duplicate midnight-blue loader
 * (Anticipatory Operational Runtime §13): the operational path is never studio-eligible, so the
 * shell must never read `useSearchParams()` there — the sole thing that would make it suspend during
 * hydration and re-paint AlloyOperationalBootShell a second time. AdminV2Shell gates the suspending
 * read behind `isExperienceBuilderStudioPath(pathname)`; these cases pin that gate.
 */
describe("AdminV2Shell studio gating — operational path never reads search params", () => {
    const OPERATIONAL_PATHS = [
        "/workspace",
        "/workspace/work-unit/childcare-intake",
        "/adminV2/workspace",
        "/adminV2/workspace/work-unit/some-slug",
        "/ai-activity",
    ];

    it("treats every operational path as NOT studio-eligible (no search-params read → no suspension)", () => {
        for (const path of OPERATIONAL_PATHS) {
            expect(isExperienceBuilderStudioPath(path)).toBe(false);
        }
    });

    it("still recognizes the studio routes (where the suspending read remains gated behind Suspense)", () => {
        expect(isExperienceBuilderStudioPath("/settings/surfaces")).toBe(true);
        expect(isExperienceBuilderStudioPath("/settings/layouts")).toBe(true);
    });

    it("studio mode is inert on operational paths regardless of query params", () => {
        const studioLikeParams = new URLSearchParams("editor=1&layout=abc");
        for (const path of OPERATIONAL_PATHS) {
            expect(isExperienceBuilderStudioActive(path, studioLikeParams)).toBe(false);
        }
        // Surfaces embeds Edit in-shell (Category → Collection → Selected Surface workspace) and
        // never activates the full-bleed studio chrome, even with the legacy editor query params.
        expect(isExperienceBuilderStudioActive("/settings/surfaces", studioLikeParams)).toBe(false);
        // The legacy `/settings/layouts` entity_layouts gallery still opens the full-bleed studio.
        expect(isExperienceBuilderStudioActive("/settings/layouts", studioLikeParams)).toBe(true);
    });
});
