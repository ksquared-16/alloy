import { describe, expect, it } from "vitest";

import { surfaceRefFromPath } from "@/lib/experience/surfaceHost/surfaceRef";

/**
 * Deep-link hydration (Phase 1B): the URL is READ into a SurfaceRef via the canonical parser.
 * `key` identifies the surface (kind + slug); the record is intra-surface and never changes it.
 */
describe("surfaceRefFromPath — deep-link hydration", () => {
    it("/workspace → workspace surface", () => {
        const r = surfaceRefFromPath("/workspace");
        expect(r.kind).toBe("workspace");
        expect(r.key).toBe("workspace");
        expect(r.workUnitSlug).toBeNull();
        expect(r.recordId).toBeNull();
    });

    it("/workspace/work-unit/:slug → work-unit surface keyed by slug", () => {
        const r = surfaceRefFromPath("/workspace/work-unit/active-pipeline");
        expect(r.kind).toBe("work-unit");
        expect(r.workUnitSlug).toBe("active-pipeline");
        expect(r.key).toBe("work-unit:active-pipeline");
        expect(r.recordId).toBeNull();
    });

    it("/workspace/work-unit/:slug/:recordId → record is intra-surface (same key)", () => {
        const withRecord = surfaceRefFromPath("/workspace/work-unit/active-pipeline/opp-123");
        const noRecord = surfaceRefFromPath("/workspace/work-unit/active-pipeline");
        expect(withRecord.recordId).toBe("opp-123");
        expect(withRecord.key).toBe(noRecord.key); // record does NOT change the surface
    });

    it("different work units are different surfaces", () => {
        expect(surfaceRefFromPath("/workspace/work-unit/a").key).not.toBe(
            surfaceRefFromPath("/workspace/work-unit/b").key,
        );
    });

    it("defensive: null / garbage / non-operator paths default to workspace (fallback)", () => {
        expect(surfaceRefFromPath(null).kind).toBe("workspace");
        expect(surfaceRefFromPath(undefined).kind).toBe("workspace");
        expect(surfaceRefFromPath("").kind).toBe("workspace");
        expect(surfaceRefFromPath("/settings/whatever").kind).toBe("workspace");
    });
});
